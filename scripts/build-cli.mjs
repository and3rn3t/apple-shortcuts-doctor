// Bundles packages/cli (with core inlined) into the publishable, dependency-free npm bin.
// Usage: node scripts/build-cli.mjs
import { chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const outfile = fileURLToPath(
  new URL('../packages/cli/dist/shortcuts-doctor.mjs', import.meta.url)
);

await build({
  entryPoints: [fileURLToPath(new URL('../packages/cli/src/index.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node' },
  outfile,
});
chmodSync(outfile, 0o755);
