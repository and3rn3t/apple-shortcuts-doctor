// @vitest-environment node
// The research profiler must report structure only, never values from the exports it reads.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/profile-exports.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function profile(path: string): { stdout: string; profile: Record<string, unknown> } {
  const result = spawnSync(process.execPath, [script, path], { encoding: 'utf8', timeout: 20000 });
  expect(result.status).toBe(0);
  return { stdout: result.stdout, profile: JSON.parse(result.stdout) as Record<string, unknown> };
}

const profileFixtures = (): ReturnType<typeof profile> => profile(fixtures);

/** An export built to leak through every channel the profiler reads. */
function writeHostileExport(): string {
  const directory = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-profile-'));
  temporaryDirectories.push(directory);
  const hiddenUuid = 'FAKE-PRIVATE-UUID-ONE';
  const action = (id: string, parameters: unknown): unknown => ({
    WFWorkflowActionIdentifier: id,
    WFWorkflowActionParameters: parameters,
  });
  // JSON text, so "__proto__" and "constructor" arrive as ordinary own keys.
  const dictionaryParameters = `{
    "${hiddenUuid}": { "OutputUUID": "${hiddenUuid}", "Type": "PrivateToken123" },
    "MyApiKeyName": { "WFSerializationType": "PrivateSerialization", "Value": { "OutputUUID": "x" } },
    "constructor": { "toString": 1 },
    "__proto__": { "Type": "Variable" }
  }`;
  const workflow = {
    WFWorkflowClientVersion: 'PrivateVersionName',
    WFWorkflowTypes: ['Watch', 'private type with spaces'],
    PrivateTopLevelKey: true,
    WFWorkflowActions: [
      action('is.workflow.actions.dictionary', '__PARAMETERS__'),
      action('https://example.invalid/private-export', {}),
      action('is.workflow.actions.comment', { WFCommentActionText: 'private comment text' }),
    ],
  };
  const text = JSON.stringify(workflow)
    .replace('"__PARAMETERS__"', dictionaryParameters)
    .replace('{"WFWorkflowClientVersion"', '{"constructor":1,"WFWorkflowClientVersion"');
  writeFileSync(join(directory, 'hostile.json'), text);
  return directory;
}

describe('scripts/profile-exports.mjs', () => {
  it('profiles every fixture container identically', () => {
    const { profile } = profileFixtures();
    expect(profile.files).toBe(3);
    expect(profile.containers).toEqual({ 'binary-plist': 1, json: 1, 'xml-plist': 1 });
    expect(profile.inspected).toBe(3);
    expect(profile.rejectedIdentifiers).toBe(0);
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

  it('redacts user-defined keys, unrecognized enum values, and rejected identifiers', () => {
    const { stdout, profile: result } = profile(writeHostileExport());
    for (const secret of [
      'PRIVATE-UUID',
      'PrivateToken123',
      'PrivateSerialization',
      'PrivateVersionName',
      'private type with spaces',
      'PrivateTopLevelKey',
      'MyApiKeyName',
      'example.invalid',
      'private-export',
      'private comment text',
    ]) {
      expect(stdout).not.toContain(secret);
    }
    expect(result.rejectedIdentifiers).toBe(1);
    expect(result.identifiers).toHaveProperty(['<rejected>'], 1);
    expect(result.enumValues).toHaveProperty(['WFWorkflowClientVersion', '<other>'], 1);
    expect(result.enumValues).toHaveProperty(['WFWorkflowTypes', '<other>'], 1);
    expect(result.enumParameterValues).toHaveProperty(['Type', '<other>'], 1);
    expect(result.referencePaths).toHaveProperty(['<other>', 'Value.OutputUUID'], 1);
    expect(result.referencePaths).toHaveProperty(['<none>', '<key>.OutputUUID'], 1);
  });

  it('counts prototype-named keys as ordinary keys', () => {
    const { profile: result } = profile(writeHostileExport());
    const topLevel = result.topLevelKeys as Record<string, unknown>;
    expect(topLevel['<key>']).toBe(2);
    expect(Object.values(topLevel).every(value => typeof value === 'number')).toBe(true);
    const keys = (result.parameterKeysByIdentifier as Record<string, Record<string, unknown>>)[
      'is.workflow.actions.dictionary'
    ];
    expect(keys).toMatchObject({ '<key>': 4 });
  });

  it('fails with a fixed message for a missing path, without echoing it', () => {
    const missing = join(tmpdir(), 'shortcuts-doctor-private-missing-folder');
    const result = spawnSync(process.execPath, [script, missing], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      'Cannot read an input path. Check that each path exists and is readable.\n'
    );
  });

  it('prints usage and fails without arguments', () => {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage:');
  });
});
