
import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

// Load environment variables
dotenv.config();

const app = express();
// Default port is 8888
const PORT = process.env.PORT || 8888;

// Middleware
app.use(cors()); // Allow Cross-Origin requests
app.use(express.json());

// Initialize Gemini Client strictly following @google/genai coding guidelines.
// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

        if (!process.env.API_KEY) {
            return res.status(500).json({ error: 'Server configuration error: API_KEY is missing in server environment.' });
        }

        console.log(`[Gemini] Generating content for prompt: "${prompt.substring(0, 50)}..."`);

        // Use gemini-3-pro-preview for complex math reasoning tasks.
        // Simplified query structure as per guidelines.
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                systemInstruction: "You are an expert mathematics tutor. Provide step-by-step solutions to geometry and algebra problems. Be precise, use clear formatting, and explain the 'why' behind each step.",
            }
        });

        // The simplest way to extract text output is through the .text property.
        res.json({ text: response.text });

    } catch (error) {
        console.error('------- GEMINI API ERROR -------');
        console.error('Message:', error.message);
        
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
