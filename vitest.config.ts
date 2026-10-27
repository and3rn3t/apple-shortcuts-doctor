import { defineConfig } from 'vitest/config';
import { cliVersionDefine } from './scripts/cli-version.mjs';

export default defineConfig({
  define: cliVersionDefine(),
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.{ts,tsx}',
      'tests/**/*.test.ts',
    ],
    // Claude Code worktrees hold full copies of the repo, tests included.
    exclude: ['**/node_modules/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
      // Entrypoints: the CLI bin (exercised through the bundle in tests/integration) and the React mount.
      exclude: ['packages/cli/src/index.ts', 'apps/web/src/main.tsx'],
      thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 },
    },
  },
});
