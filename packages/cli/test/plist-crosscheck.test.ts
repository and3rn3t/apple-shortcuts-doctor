// @vitest-environment node
// Cross-checks the built-in plist decoder against macOS plutil. plutil is test-only; the CLI
// never spawns it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseExport } from '@shortcuts-doctor/core';

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../../../tests/fixtures/${name}`, import.meta.url));

describe.runIf(process.platform === 'darwin')('plist decoding matches macOS plutil', () => {
  it.each(['mixed-actions.plist', 'mixed-actions.binary.plist'])('%s', name => {
    const file = fixture(name);
    const viaPlutil: unknown = JSON.parse(
      execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', file]).toString('utf8')
    );
    expect(JSON.parse(JSON.stringify(parseExport(readFileSync(file))))).toEqual(viaPlutil);
  });
});
