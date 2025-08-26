// .env ফাইল থেকে API Key লোড করার জন্য এই লাইনটি অবশ্যই সবার উপরে থাকতে হবে
require('dotenv').config(); 

// প্রয়োজনীয় প্যাকেজগুলো যুক্ত করা হচ্ছে
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const port = 3000;

// JSON এবং CORS middleware সেটআপ করা হচ্ছে
app.use(express.json());
app.use(cors());

// .env ফাইল থেকে API Key-গুলো লোড করা হচ্ছে
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const MOZ_API_BASE64 = process.env.MOZ_API_BASE64;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// API Key গুলো লোড হয়েছে কিনা তা চেক করার জন্য
console.log('SERPAPI_KEY Loaded:', SERPAPI_KEY ? 'Yes' : 'No');
console.log('MOZ_API_BASE64 Loaded:', MOZ_API_BASE64 ? 'Yes' : 'No');
console.log('GEMINI_API_KEY Loaded:', GEMINI_API_KEY ? 'Yes' : 'No');


// '/analyze-seo' নামে একটি নতুন API রুট তৈরি করা হচ্ছে
app.post('/analyze-seo', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // --- ধাপ ১: SerpApi থেকে SERP ডেটা সংগ্রহ ---
        console.log('Fetching SerpApi data...');
        const serpApiUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(`site:${url}`)}&api_key=${SERPAPI_KEY}`;
        const serpResponse = await fetch(serpApiUrl);
        if (!serpResponse.ok) {
            const errorBody = await serpResponse.text();
            throw new Error(`SerpApi Error: ${serpResponse.status} - ${errorBody}`);
        }
        const serpData = await serpResponse.json();

        // --- ধাপ ২: Moz API থেকে SEO মেট্রিক্স সংগ্রহ ---
        console.log('Fetching Moz data...');
        const mozApiUrl = 'https://lsapi.seomoz.com/v2/url_metrics';
        const mozResponse = await fetch(mozApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${MOZ_API_BASE64}`
            },
            body: JSON.stringify({ "targets": [url] })
        });
        if (!mozResponse.ok) {
            const errorBody = await mozResponse.text();
            throw new Error(`Moz API Error: ${mozResponse.status} - ${errorBody}`);
        }
        const mozDataResponse = await mozResponse.json();
        const mozMetrics = mozDataResponse.results[0];

        // --- ধাপ ৩: Gemini AI দ্বারা ডেটা বিশ্লেষণ ---
        console.log('Analyzing data with Gemini...');
        const combinedData = {
            serpData: {
                organic_results_count: serpData.search_information?.total_results || 0,
                top_results: serpData.organic_results ? serpData.organic_results.slice(0, 3).map(r => ({ title: r.title, snippet: r.snippet })) : "No organic results found."
            },
            mozData: {
                domainAuthority: mozMetrics.domain_authority,
                linkingRootDomains: mozMetrics.linking_root_domains,
                spamScore: mozMetrics.spam_score
            }
        };

        const prompt = `
            Act as an expert SEO analyst. Analyze the following SEO data for the URL "${url}": ${JSON.stringify(combinedData, null, 2)}.
            
            Based on the data, respond with ONLY a valid JSON object. Do not include any text, markdown formatting, or code fences before or after the JSON object.
            
            IMPORTANT: For the 'strengths', 'weaknesses', and 'suggestions' arrays, each string in the array must be a clean, complete sentence. **Do not include any numbering (like "1.", "2."), bullet points, asterisks (*), or any other markdown formatting.**

            The JSON object must follow this exact structure. If you cannot find 2 relevant points for any array, you MUST return an empty array [] for that key.
            {
              "seoHealth": <An overall score out of 100 based on the data (number)>,
              "strengths": ["A clean sentence for the first strength.", "A clean sentence for the second strength."],
              "weaknesses": ["A clean sentence for the first weakness.", "A clean sentence for the second weakness."],
              "suggestions": ["A clean sentence for the first suggestion.", "A clean sentence for the second suggestion."]
            }
        `;

        const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!geminiResponse.ok) {
             const errorBody = await geminiResponse.text();
            throw new Error(`Gemini API Error: ${geminiResponse.status} - ${errorBody}`);
        }
        const geminiResult = await geminiResponse.json();
        const reportText = geminiResult.candidates[0].content.parts[0].text;

        // --- ধাপ ৪: চূড়ান্ত রিপোর্ট পাঠানো ---
        console.log('Report generated successfully!');
        res.status(200).json({
            report: reportText,
            mozData: {
                domainAuthority: mozMetrics.domain_authority,
                backlinks: mozMetrics.linking_root_domains,
                spamScore: mozMetrics.spam_score
            }
        });

    } catch (error) {
        console.error("Error in server function:", error);
        res.status(500).json({ error: error.message });
    }
});

// Root route to check if the server is running
app.get('/', (req, res) => {
  res.json({ message: 'Success! Your AI Analyzer server is running.' });
});
// সার্ভার চালু করা হচ্ছে
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});