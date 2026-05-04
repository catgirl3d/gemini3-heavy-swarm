/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:8080',
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              if (id.includes('gpt-tokenizer')) {
                return 'tokenizer';
              }
              if (id.includes('@google/genai')) {
                return 'vendor-genai';
              }
              if (id.includes('react-markdown') || id.includes('remark') || id.includes('micromark')) {
                return 'vendor-markdown';
              }
              if (id.includes('node_modules')) {
                return 'vendor';
              }
            }
          }
        }
      },
      define: {
        // Only inject GEMINI_API_KEY into the client bundle in development to prevent leaks in production builds
        'process.env.GEMINI_API_KEY': JSON.stringify(mode === 'development' ? env.GEMINI_API_KEY : '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          '@shared': path.resolve(__dirname, './shared'),
        }
      },
      test: {
        globals: true,
        environment: 'happy-dom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
        coverage: {
          provider: 'v8',
          include: ['src/**/*.ts', 'src/**/*.tsx', 'shared/**/*.ts'],
          thresholds: {
            'shared/api/**/*.ts': {
              statements: 60,
              branches: 50,
              functions: 60,
              lines: 60,
            },
            'shared/security/**/*.ts': {
              statements: 50,
              branches: 30,
              functions: 60,
              lines: 50,
            },
            'src/services/swarm/**/*.ts': {
              statements: 75,
              branches: 55,
              functions: 75,
              lines: 75,
            },
            'src/services/ai/**/*.ts': {
              statements: 75,
              branches: 55,
              functions: 80,
              lines: 75,
            },
            'src/stores/**/*.ts': {
              statements: 35,
              branches: 70,
              functions: 30,
              lines: 35,
            },
          },
        },
      }
    };
});
