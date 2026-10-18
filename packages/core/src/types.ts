export type RuleCategory =
  'sensitive-input' | 'outbound' | 'code-execution' | 'destructive' | 'dependency';

export type ActionCategory = RuleCategory | 'basic' | 'unknown';

export type FindingCode =
  RuleCategory | 'unknown-action' | 'duplicate-output' | 'unresolved-reference';

/** Review priority, not a vulnerability verdict. */
export type Severity = 'review' | 'warning';

export interface Rule {
  category: RuleCategory;
  message: string;
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
  actions: InspectedAction[];
  findings: Omit<Finding, 'ruleId'>[];
  limitations: string[];
}

/** Decodes an XML or binary plist into plain JSON-compatible data. */
export type PlistConverter = (bytes: Uint8Array) => unknown;
