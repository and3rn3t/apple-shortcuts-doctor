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

  it('rejects a block position with an unknown role', () => {
    const broken = structuredClone(sample);
    (broken.actions[0] as unknown as Record<string, unknown>).flow = { block: 1, role: 'sideways' };
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
    expect(sample.summary.findingsBySeverity.warning).toBe(1);
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
  });
});
