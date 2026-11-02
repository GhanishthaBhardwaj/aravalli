/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser only ever talks to its own origin; Vite forwards /api to the API server.
// The target can be changed with API_URL (the end-to-end tests point it at a test API).
const api = process.env.API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': api } },
  preview: { proxy: { '/api': api } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
