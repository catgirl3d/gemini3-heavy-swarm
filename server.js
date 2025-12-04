import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
// Node 20 has native fetch, no need for node-fetch

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Check if server has API key configured
app.get('/api/status', (req, res) => {
  res.json({
    hasServerKey: !!process.env.GEMINI_API_KEY,
    proxyMode: process.env.GEMINI_PROXY_MODE || 'demo'
  });
});

// API Proxy Endpoint
app.post('/api/gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('Error: GEMINI_API_KEY not set in environment variables');
      return res.status(500).json({ error: 'Server configuration error: API key missing' });
    }

    const { model, contents, generationConfig, systemInstruction, tools } = req.body;

    // Determine model based on proxy mode
    // If GEMINI_PROXY_MODE is 'demo' OR not set, enforce flash-lite to prevent abuse
    // Only if GEMINI_PROXY_MODE is 'private', allow the requested model
    const isPrivateMode = process.env.GEMINI_PROXY_MODE === 'private';
    const targetModel = isPrivateMode ? (model || 'gemini-2.5-flash-lite') : 'gemini-2.5-flash-lite';

    // Construct the Google API URL
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig,
        systemInstruction,
        tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Gemini API error: ${response.status}`, errorText);
      return res.status(response.status).json({ error: `Gemini API error: ${response.status}`, details: errorText });
    }

    // Proxy the stream
    res.setHeader('Content-Type', 'application/json');
    
    // Pipe the response body from Google directly to the client
    // Node native fetch body is a ReadableStream, express res is a WritableStream (Node stream)
    // We need to convert Web Stream to Node Stream
    const { Readable } = await import('stream');
    // @ts-ignore
    Readable.fromWeb(response.body).pipe(res);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Handle client-side routing by serving index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment check: GEMINI_API_KEY is ${process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET'}`);
});