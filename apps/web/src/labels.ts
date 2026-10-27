import type { FindingCode, Severity } from '@shortcuts-doctor/core';

/** Most urgent first: severity only orders manual review, it is not a verdict. */
export const SEVERITIES: readonly Severity[] = ['warning', 'review'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  warning: 'Warning',
  review: 'Review',
};

/** A `Record` over every finding code, so a new code in core fails type-checking until labeled. */
export const FINDING_LABEL: Record<FindingCode, string> = {
  'code-execution': 'Code execution',
  destructive: 'Destructive actions',
  outbound: 'Outbound channels',
  'sensitive-input': 'Sensitive inputs',
  dependency: 'Nested Shortcuts',
  'unknown-action': 'Unknown actions',
  'unresolved-reference': 'Unresolved references',
  'duplicate-output': 'Duplicate outputs',
};

/** Order of the groups within a severity; the test checks it names every code in FINDING_LABEL. */
export const FINDING_ORDER: readonly FindingCode[] = [
  'code-execution',
  'destructive',
  'outbound',
  'sensitive-input',
  'dependency',
  'unknown-action',
  'unresolved-reference',
  'duplicate-output',
];
