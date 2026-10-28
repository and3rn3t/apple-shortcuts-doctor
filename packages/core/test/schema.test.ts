// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { inspectWorkflow, toReportV1 } from '../src/index.ts';
import { action, workflow } from './helpers.ts';

const schema: object = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../schema/report.v2.json', import.meta.url)), 'utf8')
);
const validate = new Ajv2020({ strict: true }).compile(schema);

const sample = inspectWorkflow(
  workflow(
    action('getclipboard', { UUID: 'u1' }),
    action('downloadurl', { Input: { OutputUUID: 'u1' } }),
    action('downloadurl', { Input: { OutputUUID: 'missing' } }),
    { WFWorkflowActionIdentifier: 'com.vendor.App.Thing' },
    action('text')
  )
);

describe('report v2', () => {
  it('validates against schema/report.v2.json', () => {
    expect(validate(sample), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(inspectWorkflow(workflow()))).toBe(true);
  });

  it('validates a report with nested blocks and an unbalanced one', () => {
    const block = (mode: number, group: string): ReturnType<typeof action> =>
      action('conditional', { GroupingIdentifier: group, WFControlFlowMode: mode });
    const nested = inspectWorkflow(
      workflow(block(0, 'A'), action('text'), block(2, 'A'), block(0, 'B'))
    );
    expect(nested.actions[0]?.flow).toEqual({ block: 1, role: 'start' });
    expect(validate(nested), JSON.stringify(validate.errors)).toBe(true);
    expect(nested.findings.map(finding => finding.code)).toContain('unbalanced-control-flow');
  });

  it('validates variable links, magic inputs, and opted-in names', () => {
    const report = inspectWorkflow(
      workflow(
        action('setvariable', { WFVariableName: 'x' }),
        action('gettext', {
          A: { Value: { Type: 'Variable', VariableName: 'x' } },
          B: { Value: { Type: 'Clipboard' } },
        })
      ),
      { includeVariableNames: true }
    );
    expect(report.actions[1]).toMatchObject({ usesVariables: [1], magicInputs: ['clipboard'] });
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects an unknown magic input', () => {
    const broken = structuredClone(sample);
    (broken.actions[0] as unknown as Record<string, unknown>).magicInputs = ['camera'];
    expect(validate(broken)).toBe(false);
  });

  it('rejects a block position with an unknown role', () => {
    const broken = structuredClone(sample);
    (broken.actions[0] as unknown as Record<string, unknown>).flow = { block: 1, role: 'sideways' };
    expect(validate(broken)).toBe(false);
  });

  it('still accepts the actions of reports written before depth and flow existed', () => {
    const old = structuredClone(sample);
    for (const entry of old.actions as unknown as Record<string, unknown>[]) {
      delete entry.depth;
      delete entry.flow;
      delete entry.usesVariables;
      delete entry.unresolvedVariableCount;
    }
    expect(validate(old), JSON.stringify(validate.errors)).toBe(true);
  });

  it('validates possible-flow paths and rejects a malformed one', () => {
    const flow = sample.findings.find(finding => finding.code === 'possible-flow');
    expect(flow?.paths).toEqual([{ actions: [1, 2], inferred: false }]);
    const broken = structuredClone(sample);
    const finding = broken.findings.find(f => f.code === 'possible-flow');
    (finding as unknown as Record<string, unknown>).paths = [{ actions: [], inferred: 'yes' }];
    expect(validate(broken)).toBe(false);
  });

  it('rejects the legacy shape', () => {
    expect(validate(toReportV1(sample))).toBe(false);
  });

  it('summarizes findings and actions', () => {
    expect(sample.summary.actionsByCategory).toMatchObject({
      'sensitive-input': 1,
      outbound: 2,
      unknown: 1,
      basic: 1,
    });
    // The unresolved reference, and the clipboard value that may reach the request (possible-flow).
    expect(sample.summary.findingsBySeverity.warning).toBe(2);
    const total = sample.summary.findingsBySeverity;
    expect(total.review + total.warning).toBe(sample.findings.length);
  });

  it('uses catalog names as rule ids without exposing unknown identifiers', () => {
    const ruleIds = sample.findings.map(finding => finding.ruleId);
    expect(ruleIds).toContain('getclipboard');
    expect(ruleIds).toContain('third-party-action');
    expect(ruleIds).not.toContain('com.vendor.App.Thing');
  });

  it('downgrades to v1 without ruleId or summary', () => {
    const legacy = toReportV1(sample);
    expect(legacy.formatVersion).toBe(1);
    expect(legacy).not.toHaveProperty('summary');
    expect(legacy.findings[0]).not.toHaveProperty('ruleId');
    expect(legacy.actions[0]).not.toHaveProperty('depth');
    expect(legacy.actions[0]).not.toHaveProperty('flow');
    expect(legacy.actions[0]).not.toHaveProperty('usesVariables');
  });
});
