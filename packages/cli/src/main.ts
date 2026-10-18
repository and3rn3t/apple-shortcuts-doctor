import { inspectWorkflow, renderReport, toReportV1 } from '@shortcuts-doctor/core';
import type { ReportFormat } from '@shortcuts-doctor/core';
import { parseExport } from './plutil.ts';
import { readExport } from './read-export.ts';

const USAGE =
  'Usage: node inspect-shortcut.mjs [--format text|json|md] [--format-version 1|2] -- "/absolute/path/export.shortcut"\n';
const FORMATS: readonly string[] = ['text', 'json', 'md'];

interface ParsedArgs {
  format: ReportFormat;
  formatVersion: 1 | 2;
  files: string[];
  help: boolean;
}

function hasErrorCode(error: unknown): boolean {
  return error instanceof Error && 'code' in error && Boolean(error.code);
}

/** JSON is the default unless a person is reading a terminal, so the skill contract is unchanged. */
function defaultFormat(): ReportFormat {
  return process.stdout.isTTY ? 'text' : 'json';
}

function parseArgs(argv: string[]): ParsedArgs | undefined {
  const parsed: ParsedArgs = { format: defaultFormat(), formatVersion: 2, files: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--') {
      parsed.files.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--help') parsed.help = true;
    else if (arg === '--format') {
      const value = argv[++i];
      if (value === undefined || !FORMATS.includes(value)) return undefined;
      parsed.format = value as ReportFormat;
    } else if (arg === '--format-version') {
      const value = argv[++i];
      if (value !== '1' && value !== '2') return undefined;
      parsed.formatVersion = value === '1' ? 1 : 2;
    } else parsed.files.push(arg);
  }
  return parsed;
}

/** Runs the inspector for one file argument and returns the process exit code. */
export function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (!args || args.help || args.files.length !== 1) {
    process.stdout.write(USAGE);
    return args?.help ? 0 : 1;
  }
  try {
    const report = inspectWorkflow(parseExport(readExport(args.files[0] as string)));
    const legacyJson = args.format === 'json' && args.formatVersion === 1;
    process.stdout.write(
      legacyJson
        ? `${JSON.stringify(toReportV1(report), null, 2)}\n`
        : renderReport(report, args.format)
    );
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
