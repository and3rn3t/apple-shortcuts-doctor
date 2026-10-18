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
  severity: Severity;
  /** 1-based action indexes. */
  actions: number[];
  message: string;
}

export interface Report {
  formatVersion: 1;
  actionCount: number;
  actions: InspectedAction[];
  findings: Finding[];
  limitations: string[];
}

/** Decodes an XML or binary plist into plain JSON-compatible data. */
export type PlistConverter = (bytes: Uint8Array) => unknown;
