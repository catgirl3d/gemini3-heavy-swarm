# Gemini 3 Heavy Swarm

An advanced AI swarm interface supporting multiple AI providers (**Google Gemini** and **OpenRouter**). This application orchestrates a team of cooperative AI agents to produce high-quality, refined, and synthesized responses for complex queries.

## Features

- **Modular AI Providers (Strategy Pattern)**:
  - **Native Gemini**: Direct interaction with Google's Gemini models via Google AI API.
  - **OpenRouter**: Access to a wide range of models (OpenAI GPT, Anthropic Claude, DeepSeek, Meta Llama, and more) via OpenRouter API.
  - **Proxy Mode**: Secure, server-side mediated requests for public deployments with support for both Gemini and OpenRouter.
- **Multi-Agent Swarm Architecture**:
  - **Initial Drafts**: Multiple agents generate independent initial responses.
  - **Critique & Refinement**: Agents review peer drafts to improve their own answers.
  - **Final Synthesis**: A synthesizer agent merges the best insights into a single, comprehensive response.
- **Advanced Model Features**:
  - **Reasoning Models Support**: Full support for thinking/reasoning models with dedicated UI visualization for internal thoughts.
  - **Accurate Token Tracking**: Real-time token counting with separate tracking for prompt, completion, reasoning, and cached tokens, including cost estimation.
  - **Streaming Responses**: Low-latency Server-Sent Events (SSE) streaming for all supported providers.
- **Transparent Process**: View the full "Chain of Thought" and intermediate outputs from all agents via the "Show Agent Work" feature.
- **Multimodal Support**: Upload images for analysis alongside text prompts (Gemini provider).
- **Customizable Configuration**: 
  - Adjust the number of agents and system instructions for different roles.
  - Configure models per pipeline step (Initial/Refinement/Synthesis).
  - Role-based model selection for fine-grained control.
- **Modern UI**: Built with React, Vite, and TypeScript, featuring markdown rendering and syntax highlighting.
## Getting Started

### Prerequisites

- Node.js (>=20.19.0)
- At least one API key (you can add it later in the UI or via env variables):
  - **Google Gemini API key** (for the Gemini provider)
  - **OpenRouter API key** (for the OpenRouter provider)

### 🚀 Quick Start

This is the fastest way to run the swarm locally.

1. **Clone and install dependencies:**

   ```bash
   git clone https://github.com/catgirl3d/gemini3-heavy-swarm
   cd gemini3-heavy-swarm
   npm install
   ```

2. **(Optional) Configure basic environment:**

   For local testing, you can either configure API keys via environment variables **or** enter them directly in the application settings UI.  
   If you prefer the UI, you can skip environment configuration entirely.  
   Create a `.env.local` file if you want to use server-side keys or proxy mode:

   ```env
   # Provider: Google Gemini (optional)
   GEMINI_API_KEY=your_gemini_api_key_here

   # Provider: OpenRouter (optional; users can also add a key in the UI)
   OPENROUTER_API_KEY=your_openrouter_api_key_here

   # Security: these two MUST be the same value (any string you choose)
   API_SECRET=your-secret-here
   VITE_API_SECRET=your-secret-here
   ```

3. **Run the app (frontend + backend together):**

   ```bash
   npm run dev:all
   ```

4. **Open the UI:**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8080`

Use this mode for development — it enables hot reloading and full debugging features.

---

## Development Workflows

### Run frontend and backend separately

Use this if you prefer to manage processes in separate terminals:

- **Backend proxy** (API + proxy server, port 8080):

  ```bash
  npm run dev:proxy
  ```

- **Frontend** (Vite dev server, port 3000):

  ```bash
  npm run dev
  ```

### Preview production build locally

These commands build and run the optimized production bundle. Use this to verify that everything works before deploying.

```bash
# 1. Build frontend & backend
npm run build
npm run build:server

# 2. Start production server (serves UI + API)
npm run start:server
```

The app will be served at `http://localhost:8080` (handling both UI and API requests).

---

## Environment & Proxy Configuration

The application can run with direct client keys or via a secure proxy server. This section is only needed if you care about cost control, abuse protection, or public deployments.

### Proxy modes

The app includes a proxy server (`server/server.ts` for local, `functions/api/gemini.ts` and `functions/api/openrouter.ts` for Cloudflare) to handle API requests securely.  
You can configure its behavior using the `PROXY_MODE` environment variable:

- **Private mode (default)**:
  - Set `PROXY_MODE=private` (or leave undefined).
  - Allows the client to request any available model from either provider.
  - Use this for personal deployments where you want full model access via your server's API key.

- **Demo mode**:
  - Set `PROXY_MODE=demo`.
  - **Gemini**: Forces all requests to use free Gemini models (`gemini-2.5-flash-lite`).
  - **OpenRouter**: Restricts to free models only (e.g., models with `:free` suffix).
  - Helps prevent abuse and manage costs for public/demo deployments.

### Local testing (force proxy)

In development mode (e.g. via `npm run dev:all`), the application **forces requests through the local proxy server** (`server/server.ts`) by default if no user-provided API key is found. This lets you test server-side logic (rate limits, security headers, etc.) even if you have a `GEMINI_API_KEY` set in your `.env.local`.

- **Key Precedence**: An API key entered manually in the application settings **always** takes precedence and bypasses the proxy, regardless of development flags.
- **To bypass the forced proxy for env keys**
  Set `VITE_FORCE_PROXY_OFF=true` in your `.env.local`. This allows the client to use the `GEMINI_API_KEY` from your environment variables directly without routing through the local proxy.

- **Production behavior**  
  In production builds (`npm run build`), server API keys are **not** bundled into the frontend code.

  **How to configure keys:**
  1. **Server-side (proxy route)**: Set `GEMINI_API_KEY` or `OPENROUTER_API_KEY` in your hosting platform's environment variables (e.g., Cloudflare Dashboard, Vercel, Docker env). This allows users without their own keys to use the app via your proxy.
  2. **Client-side (direct route)**: Users can enter their personal API key in the application settings. This allows them to bypass the proxy and your rate limits.

**Model enforcement (proxy mode):**
- **Demo mode**: 
  - **Gemini**: Forces usage of `gemini-2.5-flash-lite` (applied in UI and enforced by server).
  - **OpenRouter**: Restricts selection to free models in the UI and enforces `:free` suffix on the server.
  - Prevents unauthorized usage of premium models in public deployments.
- **Private mode (default)**: Full access to all available models. User preferences are preserved across reloads.

### Security (X-API-Secret)

For **anti-abuse protection** in proxy mode, the application uses a "secret handshake" mechanism. Both the client and the server must have the same `API_SECRET` configured.

> [!WARNING]
> This is an **anti-abuse measure**, not a full authentication solution. Because `VITE_API_SECRET` is bundled into the frontend code, it is **visible in the browser's Network tab**. This prevents unauthorized third-party site usage and automated bot access, but it is not a secret from the end-user.

**Required environment variables:**
- `API_SECRET`: (backend) Set in your server environment or Cloudflare dashboard.
- `VITE_API_SECRET`: (frontend) Injected at build time. Must match `API_SECRET`.

For detailed security instructions and implementation details, see [docs/API_SECURITY.md](./docs/API_SECURITY.md).

### Environment variables reference

The application uses multiple environment variables for configuration. Here's a complete reference:

| Variable | Required | Where to Set | Purpose | Example Value |
|----------|----------|--------------|---------|---------------|
| **Core Configuration** |
| `GEMINI_API_KEY` | ⚠️ Conditional | Backend (`.env.local`, Cloudflare, Cloud Run) | Google Gemini API key (required only if using Gemini provider) | `AIzaSy...` |
| `OPENROUTER_API_KEY` | ⚠️ Conditional | Backend (`.env.local`, Cloudflare, Cloud Run) | OpenRouter API key (required only if using OpenRouter via proxy; users can also provide their own key in UI) | `sk-or-v1-...` |
| `API_SECRET` | ✅ Yes | Backend (`.env.local`, Cloudflare, Cloud Run) | **User-defined** secret for anti-abuse (must match `VITE_API_SECRET`) | `any-random-string` |
| `VITE_API_SECRET` | ✅ Yes | Frontend (`.env.local`, build environment) | **User-defined** client secret (must match `API_SECRET`) | `any-random-string` |
| **Security & CORS** |
| `ALLOWED_ORIGINS` | ⚠️ Recommended | Backend (Cloudflare, Cloud Run) | Comma-separated list of allowed origins for CORS | `https://example.com,https://app.example.com` |
| **Proxy Configuration** |
| `PROXY_MODE` | Optional | Backend (`.env.local`, Cloudflare, Cloud Run) | `demo` = force flash-lite model, `private` = allow all models | `demo` or `private` |
| **Development Only** |
| `VITE_FORCE_PROXY_OFF` | Optional | Frontend (`.env.local`) | Disable forced proxy for environment keys in dev mode (UI keys always bypass proxy) | `true` |
| `PORT` | Optional | Backend (`.env.local`, Cloud Run) | Server port (defaults to 8080) | `8080` |

#### Setup examples by environment

**Local development (`.env.local`):**

```env
# Required
GEMINI_API_KEY=your_api_key_here

# Optional: OpenRouter
OPENROUTER_API_KEY=your_openrouter_key_here

# These two MUST be the same value (create any random string yourself)
API_SECRET=your-secret-here
VITE_API_SECRET=your-secret-here

# Optional
PROXY_MODE=private
PORT=8080
```

**Cloudflare Pages (Dashboard → Settings → Environment variables):**
- `GEMINI_API_KEY` – Your Google AI API key (optional, only if using Gemini provider)
- `OPENROUTER_API_KEY` – Your OpenRouter API key (optional, only if using OpenRouter via proxy)
- `API_SECRET` – Complex secret string
- `ALLOWED_ORIGINS` – Comma-separated list of allowed domains (optional)
- `PROXY_MODE` – `demo` or `private`

**Cloudflare Durable Object rate limiter:**
- Deploy the worker once with `npm run deploy:do`
- In Pages, add a Durable Object binding named `RATE_LIMITER_DO`
- Select the namespace created by the `gemini3-heavy-swarm-rate-limiter` worker

**Build environment (for frontend):**

```bash
VITE_API_SECRET=your-secret-here npm run build
```

> [!NOTE]
> **Automatic production detection:**
> - **Node.js (Cloud Run/Express):** Uses `NODE_ENV === 'production'` (set in Dockerfile).
> - **Cloudflare Workers:** Checks the actual `request.url` against production domains.
> - HSTS is automatically enabled when running in production.
> 
> **Default behaviors:**
> - `ALLOWED_ORIGINS`: In production, defaults to production origins only. In development, defaults to production + localhost origins (see `shared/api/cors.core.ts`).
> - `PROXY_MODE`: Defaults to `private` (allows all models).

---

## Deployment

### Option 1: Cloudflare Pages (recommended)

Deploys the frontend + serverless backend (Functions) automatically.

| Command | Description |
|---------|-------------|
| `npm run deploy` | Builds the frontend (`dist/`) and pushes to Cloudflare Pages. Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/). |

```bash
# 1. Login to Cloudflare (one-time)
npx wrangler login

# 2. Deploy
npm run deploy
```

### Option 2: Node.js / Docker

For traditional hosting (VPS, Render, Railway, etc.).

> **Tip:** For Dockerfile and Google Cloud Run scripts, see the [`deployment/`](./deployment/README.md) directory.

| Command | Description |
|---------|-------------|
| `npm run build` | Builds the React static files into `dist/`. |
| `npm run build:server` | Bundles the Node.js server into a single file `server-build/server.js`. |
| `npm run start:server` | Starts the production server (serves static files + API). |

```bash
# Example VPS workflow
npm run build
npm run build:server
npm run start:server
```



## Using OpenRouter

The application supports [OpenRouter](https://openrouter.ai/) as an alternative AI provider, giving you access to a diverse range of models from multiple providers (OpenAI, Anthropic, DeepSeek, Meta, Google, and more).

### Getting Started with OpenRouter

1. **Get an API Key**: Sign up at [openrouter.ai](https://openrouter.ai/) and create an API key.

2. **Configure in Settings**:
   - Open Settings → General Tab
   - Select **OpenRouter** from the Provider dropdown
   - Enter your OpenRouter API key (or leave blank to use server-configured key)
   - Enter a model ID (e.g., `google/gemini-2.0-flash-thinking-exp:free`)

3. **Choose Your Connection Method**:
   - **Direct Connection**: Enter your API key in the UI (stored locally in browser)
   - **Proxy Connection**: Leave API key blank and configure `OPENROUTER_API_KEY` on the server

### Model Selection

OpenRouter provides access to hundreds of models. Find the complete model list at [openrouter.ai/models](https://openrouter.ai/models)

### OpenRouter-Specific Notes

- **Text-Only**: Search tools are automatically disabled when using OpenRouter (image analysis not yet supported)
- **Full Feature Support**: Streaming, token tracking, reasoning visualization, and model flexibility work the same as with Gemini provider

## Architecture

The project follows a modular architecture using the **Strategy Pattern** for AI providers and **Dependency Injection** for swarm orchestration.

- **AI Providers**: Encapsulated in `src/services/ai/providers`, implementing the `AiProvider` interface.
- **Swarm Orchestrator**: Manages the multi-step agent workflow in `src/services/swarm/SwarmOrchestrator.ts`.
- **Pipeline Steps**: Discrete logic for Initial, Refinement, and Synthesis phases in `src/services/swarm/steps`.

## Credits

Created by [Lisova](https://t.me/temnobogin9)
