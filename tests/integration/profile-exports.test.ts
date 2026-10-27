// @vitest-environment node
// The research profiler must report structure only, never values from the exports it reads.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/profile-exports.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));

function profileFixtures(): { stdout: string; profile: Record<string, unknown> } {
  const result = spawnSync(process.execPath, [script, fixtures], {
    encoding: 'utf8',
    timeout: 20000,
  });
  expect(result.status).toBe(0);
  return { stdout: result.stdout, profile: JSON.parse(result.stdout) as Record<string, unknown> };
}

describe('scripts/profile-exports.mjs', () => {
  it('profiles every fixture container identically', () => {
    const { profile } = profileFixtures();
    expect(profile.files).toBe(3);
    expect(profile.containers).toEqual({ 'binary-plist': 1, json: 1, 'xml-plist': 1 });
    expect(profile.inspected).toBe(3);
    expect(profile.rejectedIdentifiers).toEqual({});
    expect(profile.actionCounts).toMatchObject({ workflows: 3, min: 8, max: 8 });
  });

  it('records where references sit without copying their values', () => {
    const { profile } = profileFixtures();
    const paths = profile.referencePaths as Record<string, Record<string, number>>;
    expect(paths['<none>']).toHaveProperty(
      ['WFTextActionText.Value.attachmentsByRange.{range}.OutputUUID'],
      3
    );
  });

  it('never prints parameter values, UUIDs, or names from the exports', () => {
    const { stdout } = profileFixtures();
    expect(stdout).not.toMatch(/example\.invalid|echo fixture|Fixture: mixed/);
    const fixture = readFileSync(`${fixtures}mixed-actions.json`, 'utf8');
    const uuids = [...fixture.matchAll(/"(?:UUID|OutputUUID)":\s*"([^"]+)"/g)].map(
      match => match[1]
    );
    expect(uuids.length).toBeGreaterThan(0);
    for (const uuid of uuids) expect(stdout).not.toContain(`"${uuid}"`);
  });

  it('prints usage and fails without arguments', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage:');
  });
});
