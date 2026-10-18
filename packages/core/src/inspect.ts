import { ACTION_PREFIX, BASIC_ACTIONS, RULES } from './rules.ts';
import type {
  ActionCategory,
  Finding,
  InspectedAction,
  Report,
  ReportSummary,
  ReportV1,
  Severity,
} from './types.ts';

export const MAX_ACTIONS = 2000;
const ACTION_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/i;
const MAX_IDENTIFIER_LENGTH = 200;

export const LIMITATIONS: readonly string[] = [
  'Static inspection only; no actions or embedded code were executed.',
  'Parameters are omitted. Action identifiers are untrusted and may reveal app usage.',
  'Rules cover a limited set of action identifiers, not every Apple or third-party action.',
  'Dependencies show explicit OutputUUID references, not proven runtime data flows.',
  'Implicit input, variables, branches, loops, nested workflows, and permissions are not resolved.',
  'No findings does not mean safe; destinations, payloads, and runtime behavior need manual review.',
];

type JsonRecord = Record<string, unknown>;

interface RawAction {
  WFWorkflowActionIdentifier: string;
  WFWorkflowActionParameters?: JsonRecord;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidAction(action: unknown): action is RawAction {
  if (!isRecord(action)) return false;
  const identifier = action.WFWorkflowActionIdentifier;
  const parameters = action.WFWorkflowActionParameters;
  return (
    typeof identifier === 'string' &&
    ACTION_IDENTIFIER_PATTERN.test(identifier) &&
    identifier.length <= MAX_IDENTIFIER_LENGTH &&
    (parameters === undefined || isRecord(parameters))
  );
}

function validateWorkflow(workflow: unknown): RawAction[] {
  if (!isRecord(workflow) || !Array.isArray(workflow.WFWorkflowActions)) {
    throw new Error('Expected a workflow dictionary containing WFWorkflowActions.');
  }
  const declaredActions: unknown[] = workflow.WFWorkflowActions;
  if (declaredActions.length > MAX_ACTIONS) {
    throw new Error('Export exceeds the 2000 action inspection limit.');
  }
  // Array.from turns holes into undefined; every() and map() would silently skip them.
  const rawActions = Array.from(declaredActions);
  if (!rawActions.every(isValidAction)) {
    throw new Error(
      'Malformed action identifier or parameters. No partial inspection was produced.'
    );
  }
  return rawActions as RawAction[];
}

/** Maps each declared output UUID to the 1-based indexes of actions declaring it. */
function indexOutputUuids(rawActions: RawAction[]): Map<string, number[]> {
  const uuidIndexes = new Map<string, number[]>();
  rawActions.forEach((action, index) => {
    const uuid = action.WFWorkflowActionParameters?.UUID;
    if (typeof uuid !== 'string') return;
    const indexes = uuidIndexes.get(uuid) ?? [];
    indexes.push(index + 1);
    uuidIndexes.set(uuid, indexes);
  });
  return uuidIndexes;
}

function duplicateOutputFindings(uuidIndexes: Map<string, number[]>): Finding[] {
  return [...uuidIndexes.values()]
    .filter(indexes => indexes.length > 1)
    .map(indexes => ({
      code: 'duplicate-output',
      ruleId: 'duplicate-output',
      severity: 'warning',
      actions: indexes,
      message: 'Multiple actions declare the same output UUID; references are ambiguous.',
    }));
}

interface References {
  dependsOn: number[];
  unresolvedReferenceCount: number;
}

/** Walks parameters for explicit OutputUUID references to strictly earlier, unambiguous actions. */
function collectReferences(
  parameters: JsonRecord,
  position: number,
  uuidIndexes: Map<string, number[]>
): References {
  const dependsOn = new Set<number>();
  let unresolvedReferenceCount = 0;
  const stack: unknown[] = [parameters];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (isRecord(value) && typeof value.OutputUUID === 'string') {
      const targets = uuidIndexes.get(value.OutputUUID);
      const target = targets?.length === 1 ? targets[0] : undefined;
      if (target === undefined || target >= position) unresolvedReferenceCount++;
      else dependsOn.add(target);
    }
    for (const child of Object.values(value)) stack.push(child);
  }
  return { dependsOn: [...dependsOn].sort((a, b) => a - b), unresolvedReferenceCount };
}

function classificationFinding(identifier: string, position: number): Finding | undefined {
  const rule = RULES.get(identifier);
  if (!rule && BASIC_ACTIONS.has(identifier)) return undefined;
  if (!rule) {
    return {
      code: 'unknown-action',
      ruleId: 'unknown-action',
      severity: 'review',
      actions: [position],
      message:
        'Unrecognized action. Check its app, availability, permissions, and behavior manually.',
    };
  }
  const isHighRisk = rule.category === 'code-execution' || rule.category === 'destructive';
  return {
    code: rule.category,
    ruleId: identifier.slice(ACTION_PREFIX.length),
    severity: isHighRisk ? 'warning' : 'review',
    actions: [position],
    message: rule.message,
  };
}

function unresolvedReferenceFinding(position: number): Finding {
  return {
    code: 'unresolved-reference',
    ruleId: 'unresolved-reference',
    severity: 'warning',
    actions: [position],
    message:
      'An output reference is missing, ambiguous, or not from an earlier action. Verify it in Shortcuts.',
  };
}

function summarize(actions: InspectedAction[], findings: Finding[]): ReportSummary {
  const findingsBySeverity: Record<Severity, number> = { review: 0, warning: 0 };
  for (const finding of findings) findingsBySeverity[finding.severity]++;
  const actionsByCategory: Record<ActionCategory, number> = {
    'sensitive-input': 0,
    outbound: 0,
    'code-execution': 0,
    destructive: 0,
    dependency: 0,
    basic: 0,
    unknown: 0,
  };
  for (const action of actions) actionsByCategory[action.category]++;
  return { findingsBySeverity, actionsByCategory };
}

/** Downgrades a report to the legacy v1 shape. */
export function toReportV1(report: Report): ReportV1 {
  return {
    formatVersion: 1,
    actionCount: report.actionCount,
    actions: report.actions,
    findings: report.findings.map(finding => ({
      code: finding.code,
      severity: finding.severity,
      actions: finding.actions,
      message: finding.message,
    })),
    limitations: report.limitations,
  };
}

/**
 * Statically inspects a decoded workflow. Never executes anything and never copies
 * parameter values, URLs, or UUIDs into the report.
 */
export function inspectWorkflow(workflow: unknown): Report {
  const rawActions = validateWorkflow(workflow);
  const uuidIndexes = indexOutputUuids(rawActions);
  const findings = duplicateOutputFindings(uuidIndexes);
  const actions = rawActions.map((action, index): InspectedAction => {
    const position = index + 1;
    const identifier = action.WFWorkflowActionIdentifier;
    const rule = RULES.get(identifier);
    const recognized = Boolean(rule) || BASIC_ACTIONS.has(identifier);
    const classification = classificationFinding(identifier, position);
    if (classification) findings.push(classification);
    const references = collectReferences(
      action.WFWorkflowActionParameters ?? {},
      position,
      uuidIndexes
    );
    if (references.unresolvedReferenceCount) findings.push(unresolvedReferenceFinding(position));
    return {
      index: position,
      identifier,
      recognized,
      category: rule?.category ?? (recognized ? 'basic' : 'unknown'),
      ...references,
    };
  });
  return {
    formatVersion: 2,
    actionCount: actions.length,
    summary: summarize(actions, findings),
    actions,
    findings,
    limitations: [...LIMITATIONS],
  };
}
