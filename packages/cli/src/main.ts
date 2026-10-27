import { inspectWorkflow, renderReport, toReportV1 } from '@shortcuts-doctor/core';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';
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

const INSPECT_OPTIONS = {
  format: { type: 'string' },
  'format-version': { type: 'string' },
  'fail-on': { type: 'string' },
  quiet: { type: 'boolean' },
  help: { type: 'boolean' },
} as const satisfies ParseArgsOptionsConfig;
const INSPECT_CONFIG = { options: INSPECT_OPTIONS, allowPositionals: true, strict: true } as const;
type ParsedInspect = ReturnType<typeof parseArgs<typeof INSPECT_CONFIG>>;

interface InspectArgs {
  format: ReportFormat;
  formatVersion: 1 | 2;
  failOn: Severity | undefined;
  quiet: boolean;
  files: string[];
  help: boolean;
}

type Command = (argv: string[]) => number;

function hasErrorCode(error: unknown): boolean {
  return error instanceof Error && 'code' in error && Boolean(error.code);
}

/** JSON is the default unless a person is reading a terminal, so the skill contract is unchanged. */
function defaultFormat(): ReportFormat {
  return process.stdout.isTTY ? 'text' : 'json';
}

function toFormatVersion(value: string | undefined): 1 | 2 | undefined {
  if (value === undefined || value === '2') return 2;
  return value === '1' ? 1 : undefined;
}

function toFailOn(value: string | undefined): Severity | undefined | null {
  if (value === undefined) return undefined;
  return value === 'review' || value === 'warning' ? value : null;
}

/** Returns undefined for any invalid flag or value; parseArgs errors can quote argv, so they are dropped. */
function parseInspectArgs(argv: string[]): InspectArgs | undefined {
  let parsed: ParsedInspect;
  try {
    parsed = parseArgs({ ...INSPECT_CONFIG, args: argv });
  } catch {
    return undefined;
  }
  const { values, positionals } = parsed;
  const format = values.format ?? defaultFormat();
  const formatVersion = toFormatVersion(values['format-version']);
  const failOn = toFailOn(values['fail-on']);
  if (!FORMATS.includes(format) || formatVersion === undefined || failOn === null) return undefined;
  return {
    format: format as ReportFormat,
    formatVersion,
    failOn,
    quiet: values.quiet ?? false,
    files: positionals,
    help: values.help ?? false,
  };
}

function countAtOrAbove(report: Report, threshold: Severity): number {
  const { review, warning } = report.summary.findingsBySeverity;
  return threshold === 'warning' ? warning : review + warning;
}

function inspect(argv: string[]): number {
  const args = parseInspectArgs(argv);
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

/** Subcommands by name. Without one, argv goes to `inspect`, which keeps the skill's argv contract. */
const COMMANDS: Readonly<Record<string, Command>> = { inspect };

/** Runs the CLI for the given argv (without node and script) and returns the process exit code. */
export function main(argv: string[]): number {
  const [name, ...rest] = argv;
  const command = name === undefined ? undefined : COMMANDS[name];
  return command ? command(rest) : inspect(argv);
}
