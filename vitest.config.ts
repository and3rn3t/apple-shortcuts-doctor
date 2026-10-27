import { defineConfig } from 'vitest/config';
import { cliVersionDefine } from './scripts/cli-version.mjs';

export default defineConfig({
  define: cliVersionDefine(),
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/**/*.test.ts'],
    // Claude Code worktrees hold full copies of the repo, tests included.
    exclude: ['**/node_modules/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      // Entrypoint wiring; exercised through the bundle in tests/integration.
      exclude: ['packages/cli/src/index.ts'],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
