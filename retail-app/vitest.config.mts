import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
      // `server-only` throws outside the React Server bundle; services are plain Node in tests.
      'server-only': path.resolve(dirname, 'tests/empty.ts'),
    },
  },
  test: {
    globalSetup: './tests/global-setup.ts',
    setupFiles: './tests/setup.ts',
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
