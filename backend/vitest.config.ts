import { defineConfig } from 'vitest/config';
import { decoratorMetadata } from './vitest.plugin.js';

export default defineConfig({
  plugins: [decoratorMetadata()],
  oxc: false,
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
