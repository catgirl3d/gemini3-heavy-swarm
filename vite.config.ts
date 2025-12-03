import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // Only inject API key in development mode to prevent leaks in production builds
        'process.env.API_KEY': JSON.stringify(mode === 'development' ? env.GEMINI_API_KEY : ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(mode === 'development' ? env.GEMINI_API_KEY : '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
