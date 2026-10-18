import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main } from './main.ts';

// Public API of the bundled skill script (inspect-shortcut.mjs).
export { inspectWorkflow, MAX_BYTES } from '@shortcuts-doctor/core';
export { main } from './main.ts';
export { createPlutilConverter, parseExport } from './plutil.ts';
export { readExport } from './read-export.ts';

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return (
    Boolean(entry) && realpathSync(entry as string) === realpathSync(fileURLToPath(import.meta.url))
  );
}

if (isEntrypoint()) process.exitCode = main(process.argv.slice(2));
