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

### Development

Start the development server:

```bash
npm run dev
```

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