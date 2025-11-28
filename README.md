# Gemini 3 Heavy

An advanced AI swarm interface powered by Google's **Gemini 3 Pro Preview** model. This application orchestrates a team of cooperative AI agents to produce high-quality, refined, and synthesized responses for complex queries.

**[Live Demo](https://7a49f2be.gemini3-heavy-swarm.pages.dev)**

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
3. Set up your GEMINI_API_KEY in .env.local to your Gemini API key
4. Run the app: npm run dev


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

Created by Lisova.