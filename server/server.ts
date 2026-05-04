// Note: Using relative paths instead of aliases (@shared)
// to ensure consistency with backend environments (Cloudflare/Node)
// where aliases might not be natively supported without complex configuration.

import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import { isProductionEnvironment, MAX_REQUEST_SIZE } from '../shared/security/security';
import { getAllowedOrigins, isOriginAllowed, buildCorsHeaders, buildSecurityHeaders, checkPreflightAllowed } from '../shared/api/cors.core';
import { validateApiSecret, getProxyMode } from '../shared/api/security.core';
import { validateAndPrepareProxy, executeGeminiRequest } from '../shared/api/geminiProxy.core';
import { validateAndPrepareOpenRouterProxy, executeOpenRouterRequest } from '../shared/api/openrouterProxy.core';
import { checkRateLimit, streamToExpress } from '../shared/api/adapters/express.adapter';
import { getSafeGeminiError } from '../shared/api/errors';
import { Logger } from '../shared/utils/logger';
import dotenv from 'dotenv';

const logger = new Logger('Server');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Finds an available port starting from the given port number.
 * If the port is occupied, tries the next port (+1) until a free port is found.
 * @param startPort - The initial port to try
 * @param maxAttempts - Maximum number of ports to try (default: 10)
 * @returns Promise that resolves to an available port number
 */
async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number> {
	let currentPort = startPort;
	let attempts = 0;

	while (attempts < maxAttempts) {
		const isAvailable = await checkPortAvailable(currentPort);
		if (isAvailable) {
			return currentPort;
		}
		logger.info(`Port ${currentPort} is in use, trying ${currentPort + 1}...`);
		currentPort++;
		attempts++;
	}

	throw new Error(`Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`);
}

/**
 * Checks if a port is available for use.
 * @param port - The port number to check
 * @returns Promise that resolves to true if port is available, false otherwise
 */
function checkPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = net.createServer();
		
		server.once('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				resolve(false);
			} else {
				resolve(false);
			}
		});

		server.once('listening', () => {
			server.close();
			resolve(true);
		});

		server.listen(port);
	});
}

// Load .env.local if it exists
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const app = express();

// Trust proxy headers (X-Forwarded-For) when behind reverse proxy
app.set('trust proxy', true);

// Early check for request size to prevent DOS before parsing
app.use((req: Request, res: Response, next: NextFunction) => {
	const contentLength = parseInt(req.headers['content-length'] || '0');
	if (contentLength > MAX_REQUEST_SIZE) {
		return res.status(413).json({ error: 'Request too large' });
	}
	next();
});

// Middleware to parse JSON bodies
app.use(express.json({ limit: MAX_REQUEST_SIZE }) as any);

const allowedOrigins = getAllowedOrigins(process.env.ALLOWED_ORIGINS);
const API_SECRET = process.env.API_SECRET;

app.use((req: Request, res: Response, next: NextFunction) => {
	const isProduction = isProductionEnvironment(req);
	const isApi = req.path.startsWith('/api/');
	
	// Add Security Headers
	const securityHeaders = buildSecurityHeaders(isProduction, isApi);
	Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

	const origin = req.headers.origin as string;
	
	// CORS handling
	if (isOriginAllowed(origin, allowedOrigins)) {
		const corsHeaders = buildCorsHeaders(origin);
		Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
	}
	
	// Handle preflight requests
	const preflight = checkPreflightAllowed(req.method, origin, allowedOrigins);
	if (preflight.isPreflight) {
		if (preflight.allowed) {
			return res.status(204).end();
		} else {
			return res.status(403).json({ error: 'Origin not allowed' });
		}
	}
	
	// Block requests from non-whitelisted origins
	if (origin && !isOriginAllowed(origin, allowedOrigins)) {
		return res.status(403).json({ error: 'Origin not allowed' });
	}

	// Validate API Secret for non-GET requests to /api/
	if (isApi && req.method !== 'GET') {
		const secret = req.headers['x-api-secret'] as string;
		const validation = validateApiSecret(secret, API_SECRET);
		if (!validation.valid) {
			return res.status(validation.error === 'Server configuration error' ? 500 : 403)
				.json({ error: validation.error });
		}
	}

	// Rate limiting check - only for POST /api/gemini
	if (req.method === 'POST' && (req.path === '/api/gemini' || req.path === '/api/openrouter')) {
		const rateLimit = checkRateLimit(req.ip || 'unknown');
		if (!rateLimit.allowed) {
			return res.status(429).json({ error: 'Too many requests' });
		}
	}
	
	next();
});

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, '..', 'dist')));

// Check if server has API key configured
app.get('/api/status', (req: Request, res: Response) => {
	res.json({
		hasServerKey: !!process.env.GEMINI_API_KEY,
		hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
		hasKV: true, // Local server uses in-memory rate limiting
		proxyMode: getProxyMode(process.env.PROXY_MODE)
	});
});

// API Proxy Endpoint
app.post('/api/gemini', async (req: Request, res: Response) => {
	try {
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			logger.error('GEMINI_API_KEY not set');
			return res.status(500).json({ error: 'Server configuration error: API key missing' });
		}

		// Validation and preparation
		const isPrivateMode = getProxyMode(process.env.PROXY_MODE) === 'private';
		const preparation = validateAndPrepareProxy(req.body, isPrivateMode);
		
		if (preparation.ok === false) {
			return res.status(preparation.statusCode).json({ error: preparation.error });
		}

		logger.info(`Request received. Requested Model: ${req.body.model || 'default'}, Target: ${preparation.targetModel}`);

		// Execute request
		const response = await executeGeminiRequest(preparation.targetUrl, preparation.requestBody, apiKey);

		if (!response.ok) {
			const errorText = await response.text();
			const safeError = getSafeGeminiError(response.status, errorText);
			return res.status(safeError.statusCode).json({ error: safeError.error });
		}

		// Stream response back to client
		await streamToExpress(response, res);

	} catch (error: any) {
		logger.error(`Proxy error: ${error.message}`);
		res.status(500).json({ error: error.message });
	}
});

// OpenRouter Proxy Endpoint
app.post('/api/openrouter', async (req: Request, res: Response) => {
	try {
		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			logger.error('OPENROUTER_API_KEY not set');
			return res.status(500).json({ error: 'Server configuration error: OpenRouter API key missing' });
		}

		// Validation and preparation
		const preparation = validateAndPrepareOpenRouterProxy(req.body);
		
		if (preparation.ok === false) {
			return res.status(preparation.statusCode).json({ error: preparation.error });
		}

		logger.info(`Request received for OpenRouter model: ${req.body.model}`);

		// Execute request
		const response = await executeOpenRouterRequest(
			preparation.targetUrl,
			preparation.requestBody,
			apiKey,
			process.env.OPENROUTER_REFERER,
			process.env.OPENROUTER_TITLE
		);

		if (!response.ok) {
			const errorText = await response.text();
			return res.status(response.status).json({ error: `OpenRouter error: ${errorText}` });
		}

		// Stream response back to client
		await streamToExpress(response, res);

	} catch (error: any) {
		logger.error(`OpenRouter proxy error: ${error.message}`);
		res.status(500).json({ error: error.message });
	}
});

// Handle client-side routing by serving index.html for all other routes
app.get('*', (req: Request, res: Response) => {
	res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Start server with adaptive port selection
async function startServer() {
	try {
		const desiredPort = parseInt(process.env.PORT || '8080', 10);
		const availablePort = await findAvailablePort(desiredPort);
		
		if (availablePort !== desiredPort) {
			logger.info(`⚠️  Port ${desiredPort} was occupied, using port ${availablePort} instead`);
		}
		
		app.listen(availablePort, () => {
			logger.info(`✅ Server running on port ${availablePort}`);
			logger.info(`Environment check: GEMINI_API_KEY is ${process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET'}`)
			logger.info(`Environment check: OPENROUTER_API_KEY is ${process.env.OPENROUTER_API_KEY ? 'SET' : 'NOT SET'}`)
			logger.info(`Environment check: PROXY_MODE is ${getProxyMode(process.env.PROXY_MODE)}`);
			logger.info(`Environment check: API_SECRET is ${process.env.API_SECRET ? 'SET' : 'NOT SET'}`);
			if (process.env.ALLOWED_ORIGINS) {
				logger.info(`Environment check: ALLOWED_ORIGINS is SET`);
			}
		});
	} catch (error: any) {
		logger.error(`Failed to start server: ${error.message}`);
		process.exit(1);
	}
}

startServer();
