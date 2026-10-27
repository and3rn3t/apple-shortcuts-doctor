import { describe, expect, it } from 'vitest';
import { ACTION_PREFIX, CATALOG, inspectWorkflow } from '../src/index.ts';
import { action, workflow } from './helpers.ts';

const SECRET = 'catalog-secret-value.invalid';
const parameters = { UUID: 'catalog-uuid', WFInput: SECRET, Nested: { URL: `https://${SECRET}` } };

describe('rule catalog', () => {
  it('has unique, prefix-free identifiers and a title for every entry', () => {
    const ids = CATALOG.map(entry => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of CATALOG) {
      expect(entry.id.startsWith(ACTION_PREFIX)).toBe(false);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(Boolean(entry.message)).toBe(entry.category !== 'basic');
    }
  });

  it.each(CATALOG.map(entry => [entry.id, entry] as const))(
    '%s is classified from the catalog without leaking parameters',
    (id, entry) => {
      const report = inspectWorkflow(workflow(action(id, parameters)));
      expect(report.actions[0]).toMatchObject({ recognized: true, category: entry.category });
      if (entry.category === 'basic') {
        expect(report.findings).toEqual([]);
      } else {
        expect(report.findings).toEqual([
          expect.objectContaining({ code: entry.category, ruleId: id, message: entry.message }),
        ]);
      }
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain('catalog-uuid');
    }
  );
});
