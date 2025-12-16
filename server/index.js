
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow Cross-Origin requests
app.use(express.json());

// Initialize Gemini Client (Server-side only)
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY is not set in .env file.");
}
const ai = new GoogleGenAI({ apiKey });

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
            return res.status(500).json({ error: 'Server configuration error: API Key missing.' });
        }

        // Call Gemini API
        // Using 'gemini-3-pro-preview' for complex reasoning capabilities
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert mathematics tutor. Provide step-by-step solutions to geometry and algebra problems. Be precise, use clear formatting, and explain the 'why' behind each step.",
            }
        });

        res.json({ text: response.text });

    } catch (error) {
        console.error('Error calling Gemini API:', error);
        res.status(500).json({ 
            error: 'Failed to process the request.',
            details: error.message 
        });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`✅ Server is running on http://localhost:${PORT}`);
});
