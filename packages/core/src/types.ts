export type RuleCategory =
  'sensitive-input' | 'outbound' | 'code-execution' | 'destructive' | 'dependency';

export type ActionCategory = RuleCategory | 'basic' | 'unknown';

export type FindingCode =
  | RuleCategory
  | 'unknown-action'
  | 'duplicate-output'
  | 'unresolved-reference'
  | 'unbalanced-control-flow';

/** Review priority, not a vulnerability verdict. */
export type Severity = 'review' | 'warning';

export interface Rule {
  category: RuleCategory;
  message: string;
}

export type FlowRole = 'start' | 'middle' | 'end';

/** Where an action sits in an if / menu / repeat block. Block numbers follow start order. */
export interface FlowPosition {
  block: number;
  role: FlowRole;
}

/** Data sources a variable token reads without any action producing them. */
export type MagicInput = 'shortcut-input' | 'clipboard' | 'ask' | 'current-date' | 'device-details';

export interface InspectOptions {
  /** Include variable names (untrusted text) in the report. Off by default. */
  includeVariableNames?: boolean;
}

export interface InspectedAction {
  /** 1-based position in the workflow. */
  index: number;
  identifier: string;
  recognized: boolean;
  category: ActionCategory;
  /** 1-based indexes of earlier actions referenced through an explicit OutputUUID. */
  dependsOn: number[];
  unresolvedReferenceCount: number;
  /** 1-based indexes of earlier actions that set or append to the variables this action reads. */
  usesVariables: number[];
  /** Reads of variables no earlier action sets (excluding Repeat Item and Repeat Index). */
  unresolvedVariableCount: number;
  /**
   * Inferred, not stated in the export: this action sets no input of its own, so it probably
   * receives the output of this earlier action (1-based). Distinct from `dependsOn`.
   */
  inferredInputFrom?: number;
  /** Inputs read through variable tokens, such as the clipboard. Absent when there are none. */
  magicInputs?: MagicInput[];
  /** Names of the variables this action sets or reads. Present only with `includeVariableNames`. */
  variableNames?: string[];
  /** How many control-flow blocks enclose the action; 0 at the top level. */
  depth: number;
  /** Present on the actions that open, continue (else, menu item), or close a block. */
  flow?: FlowPosition;
}

export interface Finding {
  code: FindingCode;
  /** Stable rule key: the catalog action name for rule findings, otherwise the code. */
  ruleId: string;
  severity: Severity;
  /** 1-based action indexes. */
  actions: number[];
  message: string;
}

export interface ReportSummary {
  findingsBySeverity: Record<Severity, number>;
  actionsByCategory: Record<ActionCategory, number>;
}

export interface Report {
  formatVersion: 2;
  actionCount: number;
  summary: ReportSummary;
  actions: InspectedAction[];
  findings: Finding[];
  limitations: string[];
}

/** Legacy shape, kept available through `toReportV1` and `--format-version 1`. */
export interface ReportV1 {
  formatVersion: 1;
  actionCount: number;
  actions: Omit<
    InspectedAction,
    | 'depth'
    | 'flow'
    | 'inferredInputFrom'
    | 'usesVariables'
    | 'unresolvedVariableCount'
    | 'magicInputs'
    | 'variableNames'
  >[];
  findings: Omit<Finding, 'ruleId'>[];
  limitations: string[];
}

/** Decodes an XML or binary plist into plain JSON-compatible data. */
export type PlistConverter = (bytes: Uint8Array) => unknown;
