import { defineConfig } from 'vitest/config';
import { decoratorMetadata } from './vitest.plugin.js';

export default defineConfig({
  plugins: [decoratorMetadata()],
  oxc: false,
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // e2e tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
