import { execFileSync } from 'node:child_process';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ACTIONS = 2000;
const PREFIX = 'is.workflow.actions.';
const RULES = new Map(
  [
    ['getclipboard', 'sensitive-input', 'Reads the clipboard, which may contain private data.'],
    ['getcurrentlocation', 'sensitive-input', 'Requests location data.'],
    ['selectphotos', 'sensitive-input', 'Selects photos, which may include location metadata.'],
    ['getlatestphotos', 'sensitive-input', 'Reads recent photos, potentially including metadata.'],
    ['filter.contacts', 'sensitive-input', 'Finds contact information.'],
    ['getfile', 'sensitive-input', 'Reads files; the selected scope needs manual review.'],
    [
      'downloadurl',
      'outbound',
      'Makes a network request; inspect its method, body, and destination.',
    ],
    ['sendmessage', 'outbound', 'Can send a message; inspect recipients and input.'],
    ['sendemail', 'outbound', 'Can send email; inspect recipients, attachments, and input.'],
    ['share', 'outbound', 'Shares data through a user-selected destination.'],
    ['openurl', 'outbound', 'Opens a URL, possibly handing data to another app or website.'],
    ['runapplescript', 'code-execution', 'Runs AppleScript; embedded code is not inspected.'],
    [
      'runjavascriptforautomation',
      'code-execution',
      'Runs automation JavaScript; code is not inspected.',
    ],
    [
      'runjavascriptonwebpage',
      'code-execution',
      'Runs JavaScript on a web page; code is not inspected.',
    ],
    ['runshellscript', 'code-execution', 'Runs shell commands; embedded code is not inspected.'],
    ['runsshscript', 'code-execution', 'Runs remote commands; host and code need manual review.'],
    ['deletefiles', 'destructive', 'Can delete files; confirm scope and confirmation behavior.'],
    ['runworkflow', 'dependency', 'Calls another Shortcut whose contents were not inspected.'],
  ].map(([id, category, message]) => [`${PREFIX}${id}`, { category, message }])
);
const BASIC_ACTIONS = new Set(
  [
    'gettext',
    'text',
    'comment',
    'number',
    'url',
    'dictionary',
    'list',
    'setvariable',
    'getvariable',
    'conditional',
    'choosefrommenu',
    'repeat.count',
    'repeat.each',
    'showresult',
    'alert',
    'ask',
    'nothing',
  ].map(id => `${PREFIX}${id}`)
);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseExport(buffer, platform = process.platform) {
  if (buffer.length > MAX_BYTES) throw new Error('Export exceeds the 4 MiB inspection limit.');
  const text = buffer
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON export. Supply a complete workflow dictionary.');
    }
  }
  if (
    !text.startsWith('<?xml') &&
    !text.startsWith('<plist') &&
    !buffer.subarray(0, 8).equals(Buffer.from('bplist00'))
  ) {
    throw new Error(
      'Unsupported export. Signed containers are not decoded; supply unsigned plist or JSON.'
    );
  }
  if (platform !== 'darwin') {
    throw new Error(
      'Plist inspection requires macOS plutil. Supply a JSON workflow on this platform.'
    );
  }
  try {
    const json = execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], {
      input: buffer,
      timeout: 5000,
      maxBuffer: MAX_BYTES * 4,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return JSON.parse(json.toString('utf8'));
  } catch {
    throw new Error(
      'Cannot decode plist as JSON. It may be malformed or contain unsupported plist values.'
    );
  }
}

export function inspectWorkflow(workflow) {
  if (!isRecord(workflow) || !Array.isArray(workflow.WFWorkflowActions)) {
    throw new Error('Expected a workflow dictionary containing WFWorkflowActions.');
  }
  const rawActions = workflow.WFWorkflowActions;
  if (rawActions.length > MAX_ACTIONS)
    throw new Error('Export exceeds the 2000 action inspection limit.');
  for (const action of rawActions) {
    if (
      !isRecord(action) ||
      typeof action.WFWorkflowActionIdentifier !== 'string' ||
      !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/i.test(action.WFWorkflowActionIdentifier) ||
      action.WFWorkflowActionIdentifier.length > 200 ||
      (action.WFWorkflowActionParameters !== undefined &&
        !isRecord(action.WFWorkflowActionParameters))
    ) {
      throw new Error(
        'Malformed action identifier or parameters. No partial inspection was produced.'
      );
    }
  }

  const findings = [];
  const uuidIndexes = new Map();
  rawActions.forEach((action, index) => {
    const uuid = action.WFWorkflowActionParameters?.UUID;
    if (typeof uuid === 'string') {
      const indexes = uuidIndexes.get(uuid) ?? [];
      indexes.push(index + 1);
      uuidIndexes.set(uuid, indexes);
    }
  });
  for (const indexes of uuidIndexes.values()) {
    if (indexes.length > 1) {
      findings.push({
        code: 'duplicate-output',
        severity: 'warning',
        actions: indexes,
        message: 'Multiple actions declare the same output UUID; references are ambiguous.',
      });
    }
  }
  const actions = rawActions.map((action, index) => {
    const identifier = action.WFWorkflowActionIdentifier;
    const rule = RULES.get(identifier);
    const recognized = Boolean(rule) || BASIC_ACTIONS.has(identifier);
    if (rule || !recognized) {
      findings.push({
        code: rule?.category ?? 'unknown-action',
        severity:
          rule?.category === 'code-execution' || rule?.category === 'destructive'
            ? 'warning'
            : 'review',
        actions: [index + 1],
        message:
          rule?.message ??
          'Unrecognized action. Check its app, availability, permissions, and behavior manually.',
      });
    }
    const dependsOn = new Set();
    let unresolvedReferenceCount = 0;
    const stack = [action.WFWorkflowActionParameters ?? {}];
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      if (isRecord(value) && typeof value.OutputUUID === 'string') {
        const targets = uuidIndexes.get(value.OutputUUID);
        if (!targets || targets.length !== 1 || targets[0] >= index + 1) {
          unresolvedReferenceCount++;
        } else {
          dependsOn.add(targets[0]);
        }
      }
      for (const child of Object.values(value)) stack.push(child);
    }
    if (unresolvedReferenceCount) {
      findings.push({
        code: 'unresolved-reference',
        severity: 'warning',
        actions: [index + 1],
        message:
          'An output reference is missing, ambiguous, or not from an earlier action. Verify it in Shortcuts.',
      });
    }
    return {
      index: index + 1,
      identifier,
      recognized,
      category: rule?.category ?? (recognized ? 'basic' : 'unknown'),
      dependsOn: [...dependsOn].sort((a, b) => a - b),
      unresolvedReferenceCount,
    };
  });
  return {
    formatVersion: 1,
    actionCount: actions.length,
    actions,
    findings,
    limitations: [
      'Static inspection only; no actions or embedded code were executed.',
      'Parameters are omitted. Action identifiers are untrusted and may reveal app usage.',
      'Rules cover a limited set of action identifiers, not every Apple or third-party action.',
      'Dependencies show explicit OutputUUID references, not proven runtime data flows.',
      'Implicit input, variables, branches, loops, nested workflows, and permissions are not resolved.',
      'No findings does not mean safe; destinations, payloads, and runtime behavior need manual review.',
    ],
  };
}

export function readExport(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('Supply a regular export file.');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    let count;
    while (
      length < buffer.length &&
      (count = readSync(fd, buffer, length, buffer.length - length)) > 0
    ) {
      length += count;
    }
    if (length > MAX_BYTES) throw new Error('Export exceeds the 4 MiB inspection limit.');
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  if (args.length !== 1 || args[0] === '--help') {
    process.stdout.write('Usage: node inspect-shortcut.mjs -- "/absolute/path/export.shortcut"\n');
    process.exitCode = args[0] === '--help' ? 0 : 1;
    return;
  }
  try {
    const report = inspectWorkflow(parseExport(readExport(args[0])));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    // Filesystem error messages can contain private paths; never echo them.
    const message = error.code ? 'Cannot read the supplied export file.' : error.message;
    process.stderr.write(`Shortcuts Doctor: ${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
