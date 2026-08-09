import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Unit and component tests.
 *
 * Vitest rather than Jest: it reuses the Vite transform pipeline, so ESM,
 * TypeScript and the `@/*` path aliases work without a separate transform
 * configuration to keep in sync with `tsconfig.json`.
 *
 * End-to-end tests are a separate concern — see docs/TESTING.md.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.d.ts',
        'src/app/**/layout.tsx',
        'src/env.ts',
      ],
    },
  },
});
