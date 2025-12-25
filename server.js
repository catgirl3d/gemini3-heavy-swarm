import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { RATE_LIMIT_PER_MINUTE, DEFAULT_ALLOWED_ORIGINS, ALLOWED_MODELS, MAX_REQUEST_SIZE, MAX_CONTENT_CHARS, isProductionEnvironment } from './constants/security.js';
import { validateContents, validateContentSize, getTargetModel, buildGeminiUrl } from './constants/geminiValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local if it exists
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
	const envContent = fs.readFileSync(envPath, 'utf8');
	envContent.split('\n').forEach(line => {
		const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
		if (matched) {
			const key = matched[1];
			let value = matched[2] || '';
			// Remove quotes if present
			if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
				value = value.substring(1, value.length - 1);
			}
			if (!process.env[key]) {
				process.env[key] = value;
			}
		}
	});
}

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy headers (X-Forwarded-For) when behind reverse proxy (Cloud Run, nginx, etc.)
app.set('trust proxy', true);

// Middleware to parse JSON bodies
app.use(express.json({ limit: MAX_REQUEST_SIZE }));

// CORS Middleware with whitelist
const allowedOrigins = process.env.ALLOWED_ORIGINS 
	? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
	: DEFAULT_ALLOWED_ORIGINS;

const API_SECRET = process.env.API_SECRET;

// Simple in-memory rate limiter for local dev
const rateLimits = new Map();

app.use((req, res, next) => {
	// Add Security Headers (always applied)
	res.setHeader('X-Content-Type-Options', 'nosniff');
	res.setHeader('X-Frame-Options', 'DENY');
	
	// Apply strict CSP only to API endpoints to avoid breaking frontend
	if (req.path.startsWith('/api/')) {
		res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");
	}
	
	// HSTS only in production (auto-detected from request)
	if (isProductionEnvironment(req)) {
		res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	const origin = req.headers.origin;
	const ip = req.ip;
	
	// Rate limiting check - only for POST /api/gemini (not static files, OPTIONS, or status checks)
	const isApiCall = req.method === 'POST' && req.path === '/api/gemini';
	const now = Math.floor(Date.now() / 60000);
	const rateLimitKey = `${ip}|${now}`; // Use | separator to avoid conflicts with IPv6 colons
	const count = rateLimits.get(rateLimitKey) || 0;
	
	if (isApiCall) {
		if (count >= RATE_LIMIT_PER_MINUTE) {
			return res.status(429).json({ error: 'Too many requests' });
		}
		rateLimits.set(rateLimitKey, count + 1);
	}

	// Clean up old entries occasionally
	if (rateLimits.size > 1000) {
		const minuteAgo = now - 1;
		for (const [key] of rateLimits) {
				if (key.includes('|')) {
						const minute = parseInt(key.split('|')[1]);
						if (minute < minuteAgo) {
								rateLimits.delete(key);
						}
				}
		}
	}
	
	// Check if origin is in whitelist
	if (origin && allowedOrigins.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret');
		res.setHeader('Access-Control-Max-Age', '86400');
		res.setHeader('Vary', 'Origin'); // Prevent cache issues when reflecting origin
	}
	
	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		if (origin && allowedOrigins.includes(origin)) {
			return res.status(204).end();
		} else {
			return res.status(403).json({ error: 'Origin not allowed' });
		}
	}
	
	// Block requests from non-whitelisted origins
	if (origin && !allowedOrigins.includes(origin)) {
		return res.status(403).json({ error: 'Origin not allowed' });
	}

	// Validate API Secret for non-GET requests to /api/
	if (req.path.startsWith('/api/') && req.method !== 'GET') {
		if (!API_SECRET) {
			console.error('SECURITY ERROR: API_SECRET environment variable is not set!');
			return res.status(500).json({ error: 'Server configuration error' });
		}
		const secret = req.headers['x-api-secret'];
		if (secret !== API_SECRET) {
			return res.status(403).json({ error: 'Invalid or missing API secret' });
		}
	}
	
	next();
});

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Check if server has API key configured
app.get('/api/status', (req, res) => {
	res.json({
		hasServerKey: !!process.env.GEMINI_API_KEY,
		hasKV: true, // Local server uses in-memory rate limiting
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

		// Validation: GeminiRequest requires contents
		const validation = validateContents(contents);
		if (!validation.valid) {
			return res.status(400).json({ error: validation.error });
		}

		// Validate content length to prevent DoS
		const sizeValidation = validateContentSize(contents, MAX_CONTENT_CHARS);
		if (!sizeValidation.valid) {
			return res.status(sizeValidation.statusCode || 413).json({ error: sizeValidation.error });
		}

		// Determine model based on proxy mode
		// If GEMINI_PROXY_MODE is 'demo' OR not set, enforce flash-lite to prevent abuse
		// Only if GEMINI_PROXY_MODE is 'private', allow the requested model
		const isPrivateMode = process.env.GEMINI_PROXY_MODE === 'private';
		const targetModel = getTargetModel(model, isPrivateMode);
		console.log(`[Proxy] Request received. Requested: ${model || 'default'}, Target: ${targetModel}`);

		// Validate model against whitelist
		if (!ALLOWED_MODELS.includes(targetModel)) {
			console.warn(`[Proxy] Blocked request for unauthorized model: ${targetModel}`);
			return res.status(400).json({ error: 'Invalid or unauthorized model' });
		}

		// Construct the Google API URL (no key in URL)
		const url = buildGeminiUrl(targetModel);

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-goog-api-key': apiKey,
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

		// Proxy the stream - use upstream Content-Type from Google API
		const contentType = response.headers.get('content-type') || 'application/json';
		res.setHeader('Content-Type', contentType);
		
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
