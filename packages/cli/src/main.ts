import { inspectWorkflow } from '@shortcuts-doctor/core';
import { parseExport } from './plutil.ts';
import { readExport } from './read-export.ts';

const USAGE = 'Usage: node inspect-shortcut.mjs -- "/absolute/path/export.shortcut"\n';

function hasErrorCode(error: unknown): boolean {
  return error instanceof Error && 'code' in error && Boolean(error.code);
}

/** Runs the inspector for one file argument and returns the process exit code. */
export function main(argv: string[]): number {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  if (args.length !== 1 || args[0] === '--help') {
    process.stdout.write(USAGE);
    return args[0] === '--help' ? 0 : 1;
  }
  try {
    const report = inspectWorkflow(parseExport(readExport(args[0] as string)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    // Filesystem error messages can contain private paths; never echo them.
    const message = hasErrorCode(error)
      ? 'Cannot read the supplied export file.'
      : (error as Error).message;
    process.stderr.write(`Shortcuts Doctor: ${message}\n`);
    return 1;
  }
}
