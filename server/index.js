
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');

// Load environment variables
dotenv.config();

const app = express();
// CHANGED: Default port is now 8888
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors()); // Allow Cross-Origin requests
app.use(express.json());

// Initialize Gemini Client (Server-side only)
const apiKey = process.env.GEMINI_API_KEY;
// Allow configuring a custom Base URL for users in regions where Google is blocked (e.g., China)
const baseUrl = process.env.GEMINI_BASE_URL;

if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY is not set in .env file.");
} else {
    console.log(`✅ API Key loaded: ${apiKey.substring(0, 4)}...`);
}

if (baseUrl) {
    console.log(`✅ Using Custom Base URL: ${baseUrl}`);
}

const clientOptions = { apiKey };
if (baseUrl) {
    clientOptions.baseUrl = baseUrl;
}

const ai = new GoogleGenAI(clientOptions);

// Health Check
app.get('/', (req, res) => {
    res.send('GeoDraw Pro Solver API is running.');
});

// Solver Endpoint
app.post('/api/solve', async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        if (!apiKey) {
            return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing in server environment.' });
        }

        console.log(`[Gemini] Generating content for prompt: "${prompt.substring(0, 50)}..."`);

        // Call Gemini API
        // Using strict object structure to ensure compatibility and avoid ambiguity.
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            config: {
                systemInstruction: "You are an expert mathematics tutor. Provide step-by-step solutions to geometry and algebra problems. Be precise, use clear formatting, and explain the 'why' behind each step.",
            }
        });

        res.json({ text: response.text });

    } catch (error) {
        console.error('------- GEMINI API ERROR -------');
        console.error('Message:', error.message);
        // "fetch failed" usually means network connectivity issues (e.g. firewall/GFW)
        if (error.message.includes('fetch failed')) {
            console.error('⚠️  HINT: If you are in a restricted region (e.g. China), you MUST set GEMINI_BASE_URL in your .env file to a valid proxy (e.g. https://your-proxy-domain.com).');
        }

        if (error.response) {
            console.error('API Response:', JSON.stringify(error.response, null, 2));
        }
        console.error('Stack:', error.stack);
        console.error('--------------------------------');
        
        res.status(500).json({ 
            error: 'Failed to connect to AI Service.',
            details: error.message 
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});
