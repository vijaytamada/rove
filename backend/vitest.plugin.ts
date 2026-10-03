import ts from 'typescript';
import type { Plugin } from 'vite';

/**
 * Vitest (esbuild) does not emit decorator metadata, which Nest DI and ValidationPipe rely on.
 * Transpile app/test TypeScript with the TypeScript compiler instead (no native binaries needed).
 */
export function decoratorMetadata(): Plugin {
  return {
    name: 'ts-decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.ts') || file.includes('node_modules')) return null;
      const out = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          target: ts.ScriptTarget.ES2023,
          module: ts.ModuleKind.ESNext,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          sourceMap: true,
          isolatedModules: true,
        },
      });
      return { code: out.outputText, map: out.sourceMapText ? JSON.parse(out.sourceMapText) : null };
    },
  };
}
