/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      // Bundle @lc/shared from source (dev, test and build) so a fresh checkout needs no prebuilt dist.
      { find: /^@lc\/shared$/, replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
    ],
  },
  // API_PROXY_TARGET lets e2e (vite preview on :4173) reach the api on :3100 (D29); preview inherits server.proxy.
  server: { port: 5173, proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // Page tests wait up to 5s for a lazy route's first chunk; the default 5s test budget left no
    // room for the interactions after it when the whole monorepo suite runs in parallel.
    testTimeout: 15_000,
    // NFR-07 / D34: feature code only; tests, generated and constant files are not measured.
    coverage: {
      provider: 'v8',
      include: ['src/features/**'],
      exclude: ['**/__tests__/**', '**/*.test.*'],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { lines: 75 },
    },
  },
});
