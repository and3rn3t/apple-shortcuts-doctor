// Build-time version for the CLI, so the bundle never reads package.json at runtime.
import { readFileSync } from 'node:fs';

/** esbuild/vite `define` map that replaces __SHORTCUTS_DOCTOR_VERSION__ with the CLI version. */
export function cliVersionDefine() {
  const manifest = JSON.parse(
    readFileSync(new URL('../packages/cli/package.json', import.meta.url), 'utf8')
  );
  return { __SHORTCUTS_DOCTOR_VERSION__: JSON.stringify(manifest.version) };
}
