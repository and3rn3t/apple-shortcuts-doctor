import {
  ACTION_PREFIX,
  BASIC_ACTIONS,
  IMPLICIT_INPUT_ACTIONS,
  isAppleIdentifier,
  PASSES_NO_OUTPUT,
  RULES,
} from './rules.ts';
import type {
  ActionCategory,
  Finding,
  FlowPosition,
  InspectedAction,
  InspectOptions,
  MagicInput,
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
  'Blocks (if, menu, repeat) are shown as structure and never evaluated. Variables are linked by name to the closest earlier set or append, ignoring branches and loops. Where an action takes the output of the previous action by default, that is an inference and is marked as one. Nested workflows and permissions are not resolved.',
  'No findings does not mean safe; destinations, payloads, and runtime behavior need manual review.',
];

type JsonRecord = Record<string, unknown>;

interface RawAction {
  WFWorkflowActionIdentifier: string;
  WFWorkflowActionParameters?: JsonRecord;
}

/** Plain objects only: plist dates and data decode to Date and Uint8Array, which are leaf values. */
function isRecord(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

/** Calls `visit` for every plain object nested anywhere in the parameters. */
function visitRecords(parameters: JsonRecord, visit: (record: JsonRecord) => void): void {
  const stack: unknown[] = [parameters];
  while (stack.length) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      // One at a time: spreading a large array would exceed the engine's argument limit.
      for (const item of value as unknown[]) stack.push(item);
      continue;
    }
    if (!isRecord(value)) continue;
    visit(value);
    for (const child of Object.values(value)) stack.push(child);
  }
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
  visitRecords(parameters, record => {
    if (typeof record.OutputUUID !== 'string') return;
    const targets = uuidIndexes.get(record.OutputUUID);
    const target = targets?.length === 1 ? targets[0] : undefined;
    if (target === undefined || target >= position) unresolvedReferenceCount++;
    else dependsOn.add(target);
  });
  return { dependsOn: [...dependsOn].sort((a, b) => a - b), unresolvedReferenceCount };
}

const MAGIC_INPUTS: Record<string, MagicInput> = {
  ExtensionInput: 'shortcut-input',
  Clipboard: 'clipboard',
  Ask: 'ask',
  CurrentDate: 'current-date',
  DeviceDetails: 'device-details',
};
const MAGIC_ORDER: readonly MagicInput[] = [
  'shortcut-input',
  'clipboard',
  'ask',
  'current-date',
  'device-details',
];

/** Shortcuts itself provides these inside repeat blocks, so no action sets them. */
const PROVIDED_VARIABLE = /^Repeat (?:Item|Index)(?: \d+)?$/;
const SET_VARIABLE = `${ACTION_PREFIX}setvariable`;
const APPEND_VARIABLE = `${ACTION_PREFIX}appendvariable`;
const MAX_VARIABLE_NAME_DISPLAY = 60;
const MAX_VARIABLE_NAMES = 50;

interface TokenReads {
  variables: Set<string>;
  magic: Set<MagicInput>;
}

/** Variable tokens look like { Type: 'Variable', VariableName } and magic ones like { Type: 'Clipboard' }. */
function collectTokens(parameters: JsonRecord): TokenReads {
  const variables = new Set<string>();
  const magic = new Set<MagicInput>();
  visitRecords(parameters, record => {
    const type = record.Type;
    if (type === 'Variable' && typeof record.VariableName === 'string') {
      variables.add(record.VariableName);
    } else if (typeof type === 'string' && Object.hasOwn(MAGIC_INPUTS, type)) {
      magic.add(MAGIC_INPUTS[type] as MagicInput);
    }
  });
  return { variables, magic };
}

/** Variable names are untrusted text: printable ASCII only, and short. */
function displayVariableName(name: string): string {
  const printable = name.replace(/[^\x20-\x7e]/g, '?');
  return printable.length > MAX_VARIABLE_NAME_DISPLAY
    ? `${printable.slice(0, MAX_VARIABLE_NAME_DISPLAY)}...`
    : printable;
}

interface VariableUse {
  usesVariables: number[];
  unresolvedVariableCount: number;
  magicInputs?: MagicInput[];
  variableNames?: string[];
}

/**
 * Tracks which action last set each variable, and the appends after it. A read depends on all of
 * them. Reads are resolved before the action's own definition, so `x = x + ...` reads the old x.
 */
class VariableTracker {
  private readonly chains = new Map<string, number[]>();

  constructor(private readonly includeNames: boolean) {}

  visit(action: RawAction, position: number): VariableUse {
    const parameters = action.WFWorkflowActionParameters ?? {};
    const { variables, magic } = collectTokens(parameters);
    const sources = new Set<number>();
    let unresolved = 0;
    for (const name of variables) {
      const chain = this.chains.get(name);
      if (chain) for (const source of chain) sources.add(source);
      else if (!PROVIDED_VARIABLE.test(name)) unresolved++;
    }
    const identifier = action.WFWorkflowActionIdentifier;
    const defined = parameters.WFVariableName;
    const names = new Set(variables);
    if (typeof defined === 'string') {
      if (identifier === SET_VARIABLE) this.chains.set(defined, [position]);
      else if (identifier === APPEND_VARIABLE)
        this.chains.set(defined, [...(this.chains.get(defined) ?? []), position]);
      if (identifier === SET_VARIABLE || identifier === APPEND_VARIABLE) names.add(defined);
    }
    const use: VariableUse = {
      usesVariables: [...sources].sort((a, b) => a - b),
      unresolvedVariableCount: unresolved,
    };
    if (magic.size) use.magicInputs = MAGIC_ORDER.filter(input => magic.has(input));
    if (this.includeNames) {
      use.variableNames = [...names].sort().slice(0, MAX_VARIABLE_NAMES).map(displayVariableName);
    }
    return use;
  }
}

const MAGIC_FINDINGS: Partial<Record<MagicInput, { ruleId: string; message: string }>> = {
  clipboard: {
    ruleId: 'clipboard-token',
    message: 'Reads the clipboard through a variable token, without a Get Clipboard action.',
  },
  'device-details': {
    ruleId: 'device-details-token',
    message: 'Reads device details through a variable token.',
  },
};

function magicInputFindings(inputs: MagicInput[] | undefined, position: number): Finding[] {
  return (inputs ?? []).flatMap((input): Finding[] => {
    const finding = MAGIC_FINDINGS[input];
    if (!finding) return [];
    return [
      {
        code: 'sensitive-input',
        ruleId: finding.ruleId,
        severity: 'review',
        actions: [position],
        message: finding.message,
      },
    ];
  });
}

/** Unknown Apple actions are catalog gaps; third-party intents depend on the app that provides them. */
function unknownActionFinding(identifier: string, position: number): Finding {
  const apple = isAppleIdentifier(identifier);
  return {
    code: 'unknown-action',
    ruleId: apple ? 'unknown-apple-action' : 'third-party-action',
    severity: 'review',
    actions: [position],
    message: apple
      ? 'Apple action not in the rule catalog. Check what it reads, changes, or sends.'
      : 'Third-party app action. Its behavior depends on the app; check the app, its permissions, and the data it receives.',
  };
}

function classificationFinding(identifier: string, position: number): Finding | undefined {
  const rule = RULES.get(identifier);
  if (!rule && BASIC_ACTIONS.has(identifier)) return undefined;
  if (!rule) return unknownActionFinding(identifier, position);
  const isHighRisk = rule.category === 'code-execution' || rule.category === 'destructive';
  return {
    code: rule.category,
    ruleId: identifier.slice(ACTION_PREFIX.length),
    severity: isHighRisk ? 'warning' : 'review',
    actions: [position],
    message: rule.message,
  };
}

interface ControlFlow {
  flows: (FlowPosition | undefined)[];
  depths: number[];
  /** 1-based positions of actions that open, continue, or close a block incorrectly. */
  unbalanced: number[];
}

interface OpenBlock {
  id: string;
  block: number;
  position: number;
}

/**
 * Reads the block structure of if / menu / repeat actions from WFControlFlowMode (0 start, 1 middle,
 * 2 end) and GroupingIdentifier, without looking at identifiers or copying the grouping ids. A
 * start with no end, an end with no start, a middle or end that belongs to an outer block, a reused
 * group id, or an unreadable mode all mark the action as unbalanced.
 */
function analyzeControlFlow(rawActions: RawAction[]): ControlFlow {
  const open: OpenBlock[] = [];
  const used = new Set<string>();
  const unbalanced = new Set<number>();
  const flows: (FlowPosition | undefined)[] = [];
  const depths: number[] = [];
  let blocks = 0;
  rawActions.forEach((action, index) => {
    const position = index + 1;
    const parameters = action.WFWorkflowActionParameters;
    const mode = parameters?.WFControlFlowMode;
    const id = parameters?.GroupingIdentifier;
    flows.push(undefined);
    depths.push(open.length);
    if (mode === undefined) return;
    if (!(mode === 0 || mode === 1 || mode === 2) || typeof id !== 'string' || id === '') {
      unbalanced.add(position);
      return;
    }
    if (mode === 0) {
      if (used.has(id)) unbalanced.add(position);
      used.add(id);
      blocks++;
      flows[index] = { block: blocks, role: 'start' };
      open.push({ id, block: blocks, position });
      return;
    }
    let target = open.length - 1;
    while (target >= 0 && open[target]?.id !== id) target--;
    const found = open[target];
    if (!found) {
      unbalanced.add(position);
      return;
    }
    // Blocks opened after the one this action belongs to were never closed.
    for (const skipped of open.splice(target + 1)) unbalanced.add(skipped.position);
    if (mode === 1) {
      depths[index] = open.length - 1;
      flows[index] = { block: found.block, role: 'middle' };
      return;
    }
    open.pop();
    depths[index] = open.length;
    flows[index] = { block: found.block, role: 'end' };
  });
  for (const block of open) unbalanced.add(block.position);
  return { flows, depths, unbalanced: [...unbalanced].sort((a, b) => a - b) };
}

function unbalancedControlFlowFinding(position: number): Finding {
  return {
    code: 'unbalanced-control-flow',
    ruleId: 'unbalanced-control-flow',
    severity: 'warning',
    actions: [position],
    message:
      'A control-flow block is unbalanced: a start, else or menu item, or end is missing or out of order. Verify it in Shortcuts.',
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

/**
 * Merges single-action findings that share code, rule, severity, and message into one finding
 * listing every action, so a rule hit nine times reads as one finding. Findings that already name
 * several actions (duplicate outputs) describe a relationship between them and stay as they are.
 * Results are ordered by first action.
 */
function groupFindings(findings: Finding[]): Finding[] {
  const grouped = new Map<string, Finding>();
  const result: Finding[] = [];
  for (const finding of findings) {
    if (finding.actions.length !== 1) {
      result.push(finding);
      continue;
    }
    const key = JSON.stringify([finding.code, finding.ruleId, finding.severity, finding.message]);
    const existing = grouped.get(key);
    if (existing) existing.actions.push(...finding.actions);
    else {
      const first = { ...finding, actions: [...finding.actions] };
      grouped.set(key, first);
      result.push(first);
    }
  }
  return result.sort((a, b) => (a.actions[0] as number) - (b.actions[0] as number));
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
    actions: report.actions.map(action => ({
      index: action.index,
      identifier: action.identifier,
      recognized: action.recognized,
      category: action.category,
      dependsOn: action.dependsOn,
      unresolvedReferenceCount: action.unresolvedReferenceCount,
    })),
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
export function inspectWorkflow(workflow: unknown, options: InspectOptions = {}): Report {
  const rawActions = validateWorkflow(workflow);
  const uuidIndexes = indexOutputUuids(rawActions);
  const findings = duplicateOutputFindings(uuidIndexes);
  const controlFlow = analyzeControlFlow(rawActions);
  const variables = new VariableTracker(options.includeVariableNames === true);
  let previousOutput: number | undefined;
  findings.push(...controlFlow.unbalanced.map(unbalancedControlFlowFinding));
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
    const variableUse = variables.visit(action, position);
    findings.push(...magicInputFindings(variableUse.magicInputs, position));
    const flow = controlFlow.flows[index];
    const parameters = action.WFWorkflowActionParameters ?? {};
    const inferredInputFrom =
      previousOutput !== undefined &&
      IMPLICIT_INPUT_ACTIONS.has(identifier) &&
      !('WFInput' in parameters)
        ? previousOutput
        : undefined;
    // Block markers and comments pass nothing on, so the next action's "previous output" skips them.
    if (!('WFControlFlowMode' in parameters) && !PASSES_NO_OUTPUT.has(identifier)) {
      previousOutput = position;
    }
    return {
      index: position,
      identifier,
      recognized,
      category: rule?.category ?? (recognized ? 'basic' : 'unknown'),
      ...references,
      ...variableUse,
      ...(inferredInputFrom === undefined ? {} : { inferredInputFrom }),
      depth: controlFlow.depths[index] ?? 0,
      ...(flow ? { flow } : {}),
    };
  });
  const grouped = groupFindings(findings);
  return {
    formatVersion: 2,
    actionCount: actions.length,
    summary: summarize(actions, grouped),
    actions,
    findings: grouped,
    limitations: [...LIMITATIONS],
  };
}
