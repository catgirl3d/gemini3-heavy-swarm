# Gemini 3 Heavy Swarm

An advanced AI swarm interface powered by Google's **Gemini 3 Pro Preview** model. This application orchestrates a team of cooperative AI agents to produce high-quality, refined, and synthesized responses for complex queries.

## Features

- **Multi-Agent Swarm Architecture**:
  - **Initial Drafts**: Multiple agents generate independent initial responses.
  - **Critique & Refinement**: Agents review peer drafts to improve their own answers.
  - **Final Synthesis**: A synthesizer agent merges the best insights into a single, comprehensive response.
- **Transparent Process**: View the full "Chain of Thought" and intermediate outputs from all agents via the "Show Agent Work" feature.
- **Multimodal Support**: Upload images for analysis alongside text prompts.
- **Customizable Configuration**: Adjust the number of agents and system instructions for different roles.
- **Modern UI**: Built with React, Vite, and TypeScript, featuring markdown rendering and syntax highlighting.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- Google Gemini API Key

### Installation

1. Clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```
3. Set up your environment variables. Create a `.env.local` file:

> [!IMPORTANT]
> `API_SECRET` and `VITE_API_SECRET` **must be identical**. They are the same key used for the handshake between client and server.
> **Note:** This is a value you create yourself (any string). It is NOT something you get from Google or any other service.

   ```env
   GEMINI_API_KEY=your_api_key_here
   
   # These two MUST be the same value (create any random string yourself)
   API_SECRET=your-secret-here
   VITE_API_SECRET=your-secret-here
   ```

### Running the Application

#### Development Mode (Recommended for Local Testing)

To run the full stack (frontend + backend proxy server):

```bash
npm run dev:all
```

This will start:
- **Backend Server** on `http://localhost:8080` (handles API proxy requests)
- **Frontend (Vite)** on `http://localhost:3000` (serves the React application)

Open your browser and navigate to `http://localhost:3000`.

#### Alternative Development Commands

If you need to run components separately:

```bash
# Run only the backend proxy server
npm run dev:proxy

# Run only the frontend (in a new terminal)
npm run dev
```

#### Production Mode

To build and run the production server:

```bash
# 1. Build the frontend
npm run build

# 2. Build the backend server
npm run build:server

# 3. Start the production server
npm run start:server
```

The production server will serve both the built frontend and handle API requests on the same port (default: 8080).

### Server Configuration (Proxy Mode)

The application includes a proxy server (`server/server.ts` for local, `functions/api/gemini.ts` for Cloudflare) to handle API requests securely.

**Proxy Modes:**

You can configure the proxy behavior using the `GEMINI_PROXY_MODE` environment variable:

- **Demo Mode**:
  - Set `GEMINI_PROXY_MODE=demo`.
  - Forces all requests to use the `gemini-2.5-flash-lite` model to prevent abuse and manage costs.
  - Useful for public deployments.

- **Private Mode (Default)**:
  - Set `GEMINI_PROXY_MODE=private` (or leave undefined).
  - Allows the client to request any available model (e.g., Gemini 3 Pro).
  - Use this for personal deployments where you want full access to all models via your server's API key.

### Local Testing (Force Proxy)

In development mode (e.g. via `npm run dev:all`), the application **forces all requests through the local proxy server** (`server/server.ts`) by default. This allows you to test server-side logic (rate limits, security headers, etc.) even if you have a `GEMINI_API_KEY` set in your `.env.local`.

- **To bypass the forced proxy in dev**:
  Set `VITE_FORCE_PROXY_OFF=true` in your `.env.local`. This will allow the client to use a direct API key if one is provided in the UI settings or environment.
  
- **Production behavior**:
  In production builds (`npm run build`), the forced proxy is automatically disabled. Users can either provide their own API key (direct route) or be routed through the proxy if no key is provided.

**Model Enforcement:**
- **Demo Mode**: When using the proxy in `demo` mode, the application automatically resets the model selection to `gemini-2.5-flash-lite` on page reload to prevent unauthorized access to premium models.
- **Private Mode (Default)**: When the server is configured in `private` mode (default), user model preferences are preserved across page reloads, allowing full access to all available models.

### Security (X-API-Secret)

For **anti-abuse protection** in proxy mode, the application uses a "Secret Handshake" mechanism. Both the client and the server must have the same `API_SECRET` configured.

> [!WARNING]
> This is an **anti-abuse measure**, not a full authentication solution. Because `VITE_API_SECRET` is bundled into the frontend code, it is **visible in the browser's Network tab**. This prevents unauthorized third-party site usage and automated bot access, but it is not a secret from the end-user.

**Required Environment Variables:**
- `API_SECRET`: (Backend) Set in your server environment or Cloudflare dashboard.
- `VITE_API_SECRET`: (Frontend) Injected during build time. Must match `API_SECRET`.

For detailed security instructions and implementation details, see [docs/API_SECURITY.md](./docs/API_SECURITY.md).

### Environment Variables Reference

The application uses multiple environment variables for configuration. Here's a complete reference:

| Variable | Required | Where to Set | Purpose | Example Value |
|----------|----------|--------------|---------|---------------|
| **Core Configuration** |
| `GEMINI_API_KEY` | ✅ Yes | Backend (`.env.local`, Cloudflare, Cloud Run) | Google Gemini API key for making requests | `AIzaSy...` |
| `API_SECRET` | ✅ Yes | Backend (`.env.local`, Cloudflare, Cloud Run) | **User-defined** secret for anti-abuse (must match `VITE_API_SECRET`) | `any-random-string` |
| `VITE_API_SECRET` | ✅ Yes | Frontend (`.env.local`, build environment) | **User-defined** client secret (must match `API_SECRET`) | `any-random-string` |
| **Security & CORS** |
| `ALLOWED_ORIGINS` | ⚠️ Recommended | Backend (Cloudflare, Cloud Run) | Comma-separated list of allowed origins for CORS | `https://example.com,https://app.example.com` |
| **Proxy Configuration** |
| `GEMINI_PROXY_MODE` | Optional | Backend (`.env.local`, Cloudflare, Cloud Run) | `demo` = force flash-lite model, `private` = allow all models | `demo` or `private` |
| **Development Only** |
| `VITE_FORCE_PROXY_OFF` | Optional | Frontend (`.env.local`) | Disable forced proxy in dev mode | `true` |
| `PORT` | Optional | Backend (`.env.local`, Cloud Run) | Server port (defaults to 8080) | `8080` |

#### Setup Instructions by Environment

**Local Development (`.env.local`):**
```env
# Required
GEMINI_API_KEY=your_api_key_here

# These two MUST be the same value (create any random string yourself)
API_SECRET=your-secret-here
VITE_API_SECRET=your-secret-here

# Optional
GEMINI_PROXY_MODE=private
PORT=8080
```

**Cloudflare Pages (Dashboard → Settings → Environment variables):**
- `GEMINI_API_KEY` - Your Google AI API key
- `API_SECRET` - Complex secret string
- `ALLOWED_ORIGINS` - Comma-separated list of allowed domains (optional)
- `GEMINI_PROXY_MODE` - `demo` or `private`

**Cloudflare KV Binding (Dashboard → Settings → Functions → KV namespace bindings):**
- `RATE_LIMIT_KV` - Create a KV namespace for rate limiting and bind it with this name

**Build Environment (for frontend):**
```bash
VITE_API_SECRET=your-secret-here npm run build
```

> [!NOTE]
> **Automatic Production Detection:**
> - **Node.js (Cloud Run/Express):** Uses `NODE_ENV === 'production'` (set in Dockerfile).
> - **Cloudflare Workers:** Checks the actual `request.url` against production domains.
> - HSTS is automatically enabled when running in production.
> 
> **Default Behaviors:**
> - `ALLOWED_ORIGINS`: Defaults to production + localhost origins (see `shared/security/security.ts`)
> - `GEMINI_PROXY_MODE`: Defaults to `private` (allows all models)

For detailed security information, see [docs/API_SECURITY.md](./docs/API_SECURITY.md).

### Deployment Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Builds the React frontend into `dist/`. |
| `npm run build:server` | Bundles the TypeScript server into `server-build/server.js`. |
| `npm run start:server` | Runs the compiled production-ready server. |
| `npm run dev:all` | **Recommended:** Runs both backend and frontend concurrently. |
| `npm run dev:proxy` | Runs the server in development mode (using `tsx`). |
| `npm run typecheck` | Validates TypeScript types across the project. |
| `npm run deploy` | Builds the frontend and deploys to Cloudflare Pages. |

Deploy to Cloudflare Pages (requires Wrangler):

```bash
npm run deploy
```

## Credits

Created by [Lisova](https://t.me/temnobogin9)