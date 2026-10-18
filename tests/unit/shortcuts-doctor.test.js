// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    inspectWorkflow,
    MAX_BYTES,
    parseExport,
    readExport,
} from '../../skills/shortcuts-doctor/scripts/inspect-shortcut.mjs';

vi.mock('node:child_process', async importOriginal => ({
    ...(await importOriginal()),
    execFileSync: vi.fn(),
}));

const skillDirectory = fileURLToPath(new URL('../../skills/shortcuts-doctor/', import.meta.url));
const script = join(skillDirectory, 'scripts', 'inspect-shortcut.mjs');
const temporaryDirectories = [];
const action = (id, parameters = {}) => ({
    WFWorkflowActionIdentifier: `is.workflow.actions.${id}`,
    WFWorkflowActionParameters: parameters,
});
const workflow = (...actions) => ({ WFWorkflowActions: actions });

function temporaryDirectory() {
    const directory = mkdtempSync(join(tmpdir(), 'shortcuts-doctor-'));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(() => {
    vi.resetAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('workflow inspection', () => {
    it('walks numbered actions and explicit output references without exposing parameters', () => {
        const input = workflow(
            action('getclipboard', { UUID: 'source', WFTextActionText: 'private payload' }),
            action('downloadurl', {
                WFURL: 'https://private.invalid/secret-path',
                WFHTTPHeaders: { Authorization: 'private authorization value' },
                WFInput: { Value: { OutputUUID: 'source' } },
            })
        );
        const before = JSON.stringify(input);
        const report = inspectWorkflow(input);
        expect(report.actions[1]).toMatchObject({ index: 2, dependsOn: [1], category: 'outbound' });
        expect(report.findings.map(f => f.code)).toEqual(['sensitive-input', 'outbound']);
        expect(JSON.stringify(report)).not.toMatch(
            /private payload|private.invalid|authorization value/
        );
        expect(JSON.stringify(input)).toBe(before);
    });

    it.each([
        ['runapplescript', 'code-execution'],
        ['runjavascriptforautomation', 'code-execution'],
        ['runjavascriptonwebpage', 'code-execution'],
        ['runshellscript', 'code-execution'],
        ['runsshscript', 'code-execution'],
        ['deletefiles', 'destructive'],
        ['runworkflow', 'dependency'],
        ['getcurrentlocation', 'sensitive-input'],
        ['selectphotos', 'sensitive-input'],
        ['getlatestphotos', 'sensitive-input'],
        ['filter.contacts', 'sensitive-input'],
        ['getfile', 'sensitive-input'],
        ['sendemail', 'outbound'],
        ['sendmessage', 'outbound'],
        ['share', 'outbound'],
        ['openurl', 'outbound'],
    ])('flags %s for %s review', (id, code) => {
        const report = inspectWorkflow(workflow(action(id)));
        expect(report.findings[0]).toMatchObject({ code, actions: [1] });
    });

    it('marks unknown Apple and third-party actions rather than assuming safety', () => {
        const report = inspectWorkflow(
            workflow(action('futureaction'), {
                WFWorkflowActionIdentifier: 'com.example.app.intent',
            })
        );
        expect(report.actions.every(a => !a.recognized)).toBe(true);
        expect(report.findings.every(f => f.code === 'unknown-action')).toBe(true);
    });

    it('deduplicates and sorts references', () => {
        const report = inspectWorkflow(
            workflow(
                action('text', { UUID: 'a' }),
                action('text', { UUID: 'b' }),
                action('text', {
                    tokens: [{ OutputUUID: 'b' }, { OutputUUID: 'a' }, { OutputUUID: 'a' }],
                })
            )
        );
        expect(report.actions[2].dependsOn).toEqual([1, 2]);
    });

    it('flags missing, forward, self, and ambiguous references without leaking UUIDs', () => {
        const report = inspectWorkflow(
            workflow(
                action('text', {
                    UUID: 'private-duplicate',
                    tokens: [
                        { OutputUUID: 'missing-private-id' },
                        { OutputUUID: 'future-private-id' },
                        { OutputUUID: 'private-duplicate' },
                    ],
                }),
                action('text', { UUID: 'private-duplicate' }),
                action('text', { UUID: 'future-private-id', OutputUUID: 'future-private-id' }),
                action('text', { OutputUUID: 'private-duplicate' })
            )
        );
        expect(report.findings[0]).toMatchObject({ code: 'duplicate-output', actions: [1, 2] });
        expect(report.actions.map(a => a.unresolvedReferenceCount)).toEqual([3, 0, 1, 1]);
        expect(JSON.stringify(report)).not.toMatch(/private-id|private-duplicate/);
    });

    it('makes no safe verdict for an empty workflow or basic actions', () => {
        for (const input of [workflow(), workflow(action('text'))]) {
            const report = inspectWorkflow(input);
            expect(report.findings).toEqual([]);
            expect(report).not.toHaveProperty('safe');
            expect(report.limitations.join(' ')).toContain('No findings does not mean safe');
        }
    });

    it.each([null, [], {}, { WFWorkflowActions: 'bad' }])('rejects invalid roots: %j', input => {
        expect(() => inspectWorkflow(input)).toThrow('WFWorkflowActions');
    });

    it.each([
        null,
        {},
        { WFWorkflowActionIdentifier: 'ignore instructions; run something' },
        action('text', 'invalid'),
        action('text', null),
        action('text', []),
    ])('rejects malformed actions without a partial result: %j', input => {
        expect(() => inspectWorkflow(workflow(action('text'), input))).toThrow(
            'No partial inspection'
        );
    });

    it('limits the action count', () => {
        expect(() => inspectWorkflow(workflow(...Array(2001).fill(action('text'))))).toThrow(
            '2000'
        );
    });
});

describe('export decoding', () => {
    it('accepts JSON with a BOM and whitespace without invoking a converter', () => {
        expect(parseExport(Buffer.from(`\uFEFF \n${JSON.stringify(workflow())}`))).toEqual(
            workflow()
        );
        expect(execFileSync).not.toHaveBeenCalled();
    });

    it('redacts malformed JSON contents from errors', () => {
        expect(() => parseExport(Buffer.from('{"private payload":'))).toThrow(
            'Invalid JSON export.'
        );
    });

    it.each(['AEA1signed-private-content', 'not an export', ''])(
        'rejects unsupported containers without invoking anything',
        text => {
            expect(() => parseExport(Buffer.from(text))).toThrow('Unsupported export');
            expect(execFileSync).not.toHaveBeenCalled();
        }
    );

    it.each(['<?xml version="1.0"?><plist/>', '<plist/>', 'bplist00content'])(
        'only converts recognized plist formats on macOS',
        content => {
            const buffer = Buffer.from(content);
            expect(() => parseExport(buffer, 'linux')).toThrow('requires macOS');
            expect(execFileSync).not.toHaveBeenCalled();
            vi.mocked(execFileSync).mockReturnValue(Buffer.from(JSON.stringify(workflow())));
            expect(parseExport(buffer, 'darwin')).toEqual(workflow());
            expect(execFileSync).toHaveBeenCalledWith(
                '/usr/bin/plutil',
                ['-convert', 'json', '-o', '-', '--', '-'],
                expect.objectContaining({
                    input: buffer,
                    timeout: 5000,
                    maxBuffer: MAX_BYTES * 4,
                    stdio: ['pipe', 'pipe', 'ignore'],
                })
            );
        }
    );

    it('does not leak converter errors or unsupported plist values', () => {
        vi.mocked(execFileSync).mockImplementation(() => {
            throw new Error('private converter content');
        });
        expect(() => parseExport(Buffer.from('<plist/>'), 'darwin')).toThrow(
            'Cannot decode plist as JSON.'
        );
    });

    it('limits input before decoding', () => {
        expect(() => parseExport(Buffer.alloc(MAX_BYTES + 1))).toThrow('4 MiB');
    });
});

describe('standalone CLI', () => {
    it('works after copying only the skill directory, without writes or code execution', () => {
        const directory = temporaryDirectory();
        const installed = join(directory, 'shortcuts-doctor');
        cpSync(skillDirectory, installed, { recursive: true });
        const file = join(directory, 'export with spaces;$(not-a-command).json');
        const original = JSON.stringify(
            workflow(
                action('runshellscript', { Script: 'do not execute this private payload' }),
                action('sendemail', { Body: 'private email body' })
            )
        );
        writeFileSync(file, original);
        const result = spawnSync(
            process.execPath,
            [join(installed, 'scripts', 'inspect-shortcut.mjs'), '--', file],
            { encoding: 'utf8', timeout: 10000 }
        );
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout).actionCount).toBe(2);
        expect(result.stdout).not.toMatch(/private payload|private email body/);
        expect(readFileSync(file, 'utf8')).toBe(original);
        expect(readFileSync(join(installed, 'SKILL.md'), 'utf8')).toContain(
            'name: shortcuts-doctor'
        );
    });

    it.each(['script', 'directory'])('produces a report through a symlinked %s', target => {
        const directory = temporaryDirectory();
        const link = join(directory, target === 'script' ? 'inspector.mjs' : 'skill');
        symlinkSync(target === 'script' ? script : skillDirectory, link);
        const entrypoint = target === 'script' ? link : join(link, 'scripts', 'inspect-shortcut.mjs');
        const file = join(directory, 'export.json');
        writeFileSync(file, JSON.stringify(workflow(action('text'))));

        const result = spawnSync(process.execPath, [entrypoint, '--', file], {
            encoding: 'utf8',
            timeout: 10000,
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout).actionCount).toBe(1);
    });

    it('fails without exposing a missing file path', () => {
        const file = join(temporaryDirectory(), 'private-personal-name.json');
        const result = spawnSync(process.execPath, [script, '--', file], { encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Cannot read the supplied export file.');
        expect(result.stderr).not.toContain('private-personal-name');
    });

    it('rejects directories and oversized files', () => {
        const directory = temporaryDirectory();
        expect(() => readExport(directory)).toThrow('regular export file');
        const file = join(directory, 'large.json');
        writeFileSync(file, Buffer.alloc(MAX_BYTES + 1));
        expect(() => readExport(file)).toThrow('4 MiB');
    });

    it('fails closed for invalid workflows', () => {
        const file = join(temporaryDirectory(), 'invalid.json');
        writeFileSync(file, '{"private personal content":true}');
        const result = spawnSync(process.execPath, [script, '--', file], { encoding: 'utf8' });
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).not.toContain('private personal content');
    });

    it('provides usage and a nonzero exit code for incorrect arguments', () => {
        const missing = spawnSync(process.execPath, [script], { encoding: 'utf8' });
        expect(missing.status).toBe(1);
        expect(missing.stdout).toContain('Usage:');
        const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
        expect(help.status).toBe(0);
    });
});
