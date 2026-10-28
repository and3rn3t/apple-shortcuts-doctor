import { ACTION_PREFIX } from './rules.ts';
import type { Finding, InspectedAction, Report } from './types.ts';

export type ReportFormat = 'text' | 'json' | 'md';

/** Action identifiers are untrusted: shorten the Apple prefix and replace anything non-printable. */
export function displayIdentifier(identifier: string): string {
  const shortened = identifier.startsWith(ACTION_PREFIX)
    ? identifier.slice(ACTION_PREFIX.length)
    : identifier;
  return shortened.replace(/[^\x20-\x7e]/g, '?');
}

function markdownCode(text: string): string {
  return `\`${text.replaceAll('`', "'")}\``;
}

const MAX_INDENT_DEPTH = 10;

const ROLE_LABELS = { start: 'start', middle: 'else/item', end: 'end' } as const;

/**
 * Nested actions are indented under their block; very deep nesting stops indenting. Markdown uses
 * nested bullets with the action number written out (the backslash keeps `10.` from starting a
 * list), so nesting works at any depth and the numbers match the ones findings refer to.
 */
function actionLine(
  action: InspectedAction,
  label: (text: string) => string,
  style: 'text' | 'markdown'
): string {
  const depends = action.dependsOn.length ? ` <- #${action.dependsOn.join(', #')}` : '';
  const viaVariables = action.usesVariables.length
    ? ` <~ #${action.usesVariables.join(', #')}`
    : '';
  const unresolved = unresolvedNote(action);
  const flow = action.flow ? ` {block ${action.flow.block} ${ROLE_LABELS[action.flow.role]}}` : '';
  const inputs = action.magicInputs?.length ? ` {reads ${action.magicInputs.join(', ')}}` : '';
  const names = action.variableNames?.length
    ? ` {variables ${action.variableNames.map(name => label(name)).join(', ')}}`
    : '';
  const level = Math.min(action.depth, MAX_INDENT_DEPTH);
  const lead =
    style === 'markdown'
      ? `${'  '.repeat(level)}- ${action.index}\\.`
      : `${'  '.repeat(level)}${action.index}.`;
  return `${lead} ${label(displayIdentifier(action.identifier))} [${action.category}]${flow}${inputs}${names}${depends}${viaVariables}${unresolved}`;
}

function unresolvedNote(action: InspectedAction): string {
  const notes = [
    action.unresolvedReferenceCount
      ? `${action.unresolvedReferenceCount} unresolved reference(s)`
      : '',
    action.unresolvedVariableCount ? `${action.unresolvedVariableCount} unset variable(s)` : '',
  ].filter(note => note !== '');
  return notes.length ? ` (${notes.join(', ')})` : '';
}

function findingLine(finding: Finding): string {
  const targets = finding.actions.map(index => `#${index}`).join(', ');
  return `${finding.severity.toUpperCase()} ${finding.code} (${targets}): ${finding.message}`;
}

function section(title: string, lines: string[], empty: string): string[] {
  return [title, ...(lines.length ? lines : [empty])];
}

/** Plain-text report for terminals. */
export function renderText(report: Report): string {
  const lines = [
    `Shortcuts Doctor: ${report.actionCount} action(s), ${report.findings.length} finding(s)`,
    '',
    ...section(
      'Actions',
      report.actions.map(action => actionLine(action, text => text, 'text')),
      '(none)'
    ),
    '',
    ...section(
      'Findings',
      report.findings.map(findingLine),
      '(none; this is not a safety verdict)'
    ),
    '',
    'Limitations',
    ...report.limitations.map(limitation => `- ${limitation}`),
  ];
  return `${lines.join('\n')}\n`;
}

/** Markdown report suitable for pasting into reviews and issues. */
export function renderMarkdown(report: Report): string {
  const lines = [
    '# Shortcuts Doctor report',
    '',
    `${report.actionCount} action(s), ${report.findings.length} finding(s).`,
    '',
    ...section(
      '## Actions',
      report.actions.map(action => actionLine(action, markdownCode, 'markdown')),
      '_None._'
    ),
    '',
    ...section(
      '## Findings',
      report.findings.map(finding => `- ${findingLine(finding)}`),
      '_None. This is not a safety verdict._'
    ),
    '',
    '## Limitations',
    ...report.limitations.map(limitation => `- ${limitation}`),
  ];
  return `${lines.join('\n')}\n`;
}

export function renderReport(report: Report, format: ReportFormat): string {
  if (format === 'text') return renderText(report);
  if (format === 'md') return renderMarkdown(report);
  return `${JSON.stringify(report, null, 2)}\n`;
}
