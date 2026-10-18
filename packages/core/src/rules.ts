import type { Rule, RuleCategory } from './types.ts';

export const ACTION_PREFIX = 'is.workflow.actions.';

const RULE_ENTRIES: ReadonlyArray<readonly [string, RuleCategory, string]> = [
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
];

export const RULES: ReadonlyMap<string, Rule> = new Map(
  RULE_ENTRIES.map(([id, category, message]) => [`${ACTION_PREFIX}${id}`, { category, message }])
);

export const BASIC_ACTIONS: ReadonlySet<string> = new Set(
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
  ].map(id => `${ACTION_PREFIX}${id}`)
);
