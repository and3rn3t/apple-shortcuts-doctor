import { inspectWorkflow, renderReport, toReportV1 } from '@shortcuts-doctor/core';
import type { Report, ReportFormat, Severity } from '@shortcuts-doctor/core';
import { parseExport } from './plutil.ts';
import { readExport } from './read-export.ts';

const USAGE = [
  'Usage: shortcuts-doctor inspect [options] <export-file>',
  '       node inspect-shortcut.mjs [options] -- <export-file>',
  '',
  'Options:',
  '  --format text|json|md     Output format (default: text on a terminal, json when piped)',
  '  --format-version 1|2      JSON report version (default: 2)',
  '  --fail-on review|warning  Exit 2 if any finding is at or above this severity',
  '  --quiet                   Do not print the report (errors and --fail-on notes still print)',
  '',
  'Exit codes: 0 ok, 1 usage or input error, 2 findings reached the --fail-on threshold.',
  '',
].join('\n');
const EXIT_FINDINGS = 2;
const FORMATS: readonly string[] = ['text', 'json', 'md'];

interface ParsedArgs {
  format: ReportFormat;
  formatVersion: 1 | 2;
  failOn: Severity | undefined;
  quiet: boolean;
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

/** `inspect` is the named subcommand; the bare form stays for the skill's argv contract. */
function stripSubcommand(argv: string[]): string[] {
  return argv[0] === 'inspect' ? argv.slice(1) : argv;
}

function parseArgs(rawArgv: string[]): ParsedArgs | undefined {
  const argv = stripSubcommand(rawArgv);
  const parsed: ParsedArgs = {
    format: defaultFormat(),
    formatVersion: 2,
    failOn: undefined,
    quiet: false,
    files: [],
    help: false,
  };
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
    } else if (arg === '--fail-on') {
      const value = argv[++i];
      if (value !== 'review' && value !== 'warning') return undefined;
      parsed.failOn = value;
    } else if (arg === '--quiet') parsed.quiet = true;
    else parsed.files.push(arg);
  }
  return parsed;
}

function countAtOrAbove(report: Report, threshold: Severity): number {
  const { review, warning } = report.summary.findingsBySeverity;
  return threshold === 'warning' ? warning : review + warning;
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
    if (!args.quiet) {
      process.stdout.write(
        legacyJson
          ? `${JSON.stringify(toReportV1(report), null, 2)}\n`
          : renderReport(report, args.format)
      );
    }
    const failing = args.failOn ? countAtOrAbove(report, args.failOn) : 0;
    if (!failing) return 0;
    process.stderr.write(
      `Shortcuts Doctor: ${failing} finding(s) at or above '${args.failOn}' severity.\n`
    );
    return EXIT_FINDINGS;
  } catch (error) {
    // Filesystem error messages can contain private paths; never echo them.
    const message = hasErrorCode(error)
      ? 'Cannot read the supplied export file.'
      : (error as Error).message;
    process.stderr.write(`Shortcuts Doctor: ${message}\n`);
    return 1;
  }
}
