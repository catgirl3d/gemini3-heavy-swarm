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
3. Set up your environment variables. Create a `.env` file (or set system variables):
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

### Server Configuration (Proxy Mode)

The application includes a proxy server (`server.js` for local, `functions/api/gemini.ts` for Cloudflare) to handle API requests securely.

**Proxy Modes:**

You can configure the proxy behavior using the `GEMINI_PROXY_MODE` environment variable:

- **Demo Mode (Default)**:
  - Set `GEMINI_PROXY_MODE=demo` (or leave undefined).
  - Forces all requests to use the `gemini-2.5-flash-lite` model to prevent abuse and manage costs.
  - Useful for public deployments.

- **Private Mode**:
  - Set `GEMINI_PROXY_MODE=private`.
  - Allows the client to request any available model (e.g., Gemini 3 Pro).
  - Use this for personal deployments where you want full access to all models via your server's API key.

### Local Testing (Force Proxy)

In development mode (`npm run dev`), the application **forces all requests through the local proxy server** (`server.js`) by default. This allows you to test server-side logic (rate limits, security headers, etc.) even if you have a `GEMINI_API_KEY` set in your `.env.local`.

- **To bypass the forced proxy in dev**:
  Set `VITE_FORCE_PROXY_OFF=true` in your `.env.local`. This will allow the client to use a direct API key if one is provided in the UI settings or environment.
  
- **Production behavior**:
  In production builds (`npm run build`), the forced proxy is automatically disabled. Users can either provide their own API key (direct route) or be routed through the proxy if no key is provided.

### Security (X-API-Secret)

For **anti-abuse protection** in proxy mode, the application uses a "Secret Handshake" mechanism. Both the client and the server must have the same `API_SECRET` configured.

> [!WARNING]
> This is an **anti-abuse measure**, not a full authentication solution. Because `VITE_API_SECRET` is bundled into the frontend code, it is **visible in the browser's Network tab**. This prevents unauthorized third-party site usage and automated bot access, but it is not a secret from the end-user.

**Required Environment Variables:**
- `API_SECRET`: (Backend) Set in your server environment or Cloudflare dashboard.
- `VITE_API_SECRET`: (Frontend) Injected during build time. Must match `API_SECRET`.

For detailed security instructions and implementation details, see [docs/API_SECURITY.md](./docs/API_SECURITY.md).

### Deployment Configuration

When deploying (Cloudflare Pages or Google Cloud Run), ensure the following variables are set:

1. `GEMINI_API_KEY`: Your Google AI API key.
2. `API_SECRET`: A complex secret string to protect your proxy.
3. `ALLOWED_ORIGINS`: A comma-separated list of domains allowed to access your API.
4. `GEMINI_PROXY_MODE`: Set to `private` for full model access or `demo` for restricted mode.

### Build & Deploy

Build for production:

```bash
npm run build
```

Deploy to Cloudflare Pages (requires Wrangler):

```bash
npm run deploy
```

## Credits

Created by [Lisova](https://t.me/temnobogin9)