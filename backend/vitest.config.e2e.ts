import { defineConfig } from 'vitest/config';
import { decoratorMetadata } from './vitest.plugin.js';

export default defineConfig({
  plugins: [decoratorMetadata()],
  oxc: false,
  test: {
    globals: true,
    // Tests call the job directly; the minute timer must not run underneath them.
    env: { JOBS_ENABLED: 'false' },
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // e2e tests share one database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
