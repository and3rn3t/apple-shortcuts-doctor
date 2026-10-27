import type { Rule, RuleCategory } from './types.ts';

export const ACTION_PREFIX = 'is.workflow.actions.';
/** Apple's own app intents (Notes, Reminders, …) use this prefix instead of ACTION_PREFIX. */
export const APPLE_INTENT_PREFIX = 'com.apple.';

/**
 * One catalog row. `title` is the action's name in the Shortcuts app, so every classification can
 * be checked against Apple's action library (https://support.apple.com/guide/shortcuts/).
 */
export interface CatalogEntry {
  id: string;
  title: string;
  category: RuleCategory | 'basic';
  /** Required for rule categories; basic actions produce no finding. */
  message?: string;
}

const rule = (
  id: string,
  title: string,
  category: RuleCategory,
  message: string
): CatalogEntry => ({ id, title, category, message });

const basic = (id: string, title: string): CatalogEntry => ({ id, title, category: 'basic' });

const RULE_ENTRIES: readonly CatalogEntry[] = [
  rule(
    'getclipboard',
    'Get Clipboard',
    'sensitive-input',
    'Reads the clipboard, which may contain private data.'
  ),
  rule('getcurrentlocation', 'Get Current Location', 'sensitive-input', 'Requests location data.'),
  rule(
    'selectphoto',
    'Select Photos',
    'sensitive-input',
    'Selects photos, which may include location metadata.'
  ),
  rule(
    'getlatestphotos',
    'Get Latest Photos',
    'sensitive-input',
    'Reads recent photos, potentially including metadata.'
  ),
  rule('takephoto', 'Take Photo', 'sensitive-input', 'Uses the camera to capture a photo.'),
  rule('takevideo', 'Take Video', 'sensitive-input', 'Uses the camera to record video.'),
  rule('recordaudio', 'Record Audio', 'sensitive-input', 'Uses the microphone to record audio.'),
  rule(
    'dictatetext',
    'Dictate Text',
    'sensitive-input',
    'Uses the microphone to transcribe speech.'
  ),
  rule(
    'takescreenshot',
    'Take Screenshot',
    'sensitive-input',
    'Captures the screen, which may show private data.'
  ),
  rule('filter.contacts', 'Find Contacts', 'sensitive-input', 'Finds contact information.'),
  rule(
    'selectcontacts',
    'Select Contacts',
    'sensitive-input',
    'Selects contacts, exposing their details to later actions.'
  ),
  rule(
    'filter.calendarevents',
    'Find Calendar Events',
    'sensitive-input',
    'Reads calendar events.'
  ),
  rule(
    'getupcomingevents',
    'Get Upcoming Events',
    'sensitive-input',
    'Reads upcoming calendar events.'
  ),
  rule('filter.reminders', 'Find Reminders', 'sensitive-input', 'Reads reminders.'),
  rule(
    'getupcomingreminders',
    'Get Upcoming Reminders',
    'sensitive-input',
    'Reads upcoming reminders.'
  ),
  rule('filter.health.quantity', 'Find Health Samples', 'sensitive-input', 'Reads Health data.'),
  rule(
    'documentpicker.open',
    'Get File',
    'sensitive-input',
    'Reads files; the selected scope needs manual review.'
  ),
  rule(
    'getwifi',
    'Get Network Details',
    'sensitive-input',
    'Reads network details such as the Wi-Fi network name.'
  ),
  rule(
    'getdevicedetails',
    'Get Device Details',
    'sensitive-input',
    'Reads device details such as its name or model.'
  ),
  rule(
    'downloadurl',
    'Get Contents of URL',
    'outbound',
    'Makes a network request; inspect its method, body, and destination.'
  ),
  rule(
    'getwebpagecontents',
    'Get Contents of Web Page',
    'outbound',
    'Loads a web page over the network.'
  ),
  rule(
    'url.getheaders',
    'Get Headers of URL',
    'outbound',
    'Makes a network request to read response headers.'
  ),
  rule('url.expand', 'Expand URL', 'outbound', 'Contacts the URL to follow redirects.'),
  rule(
    'getipaddress',
    'Get Current IP Address',
    'outbound',
    'May contact an external service to look up the public IP address.'
  ),
  rule(
    'sendmessage',
    'Send Message',
    'outbound',
    'Can send a message; inspect recipients and input.'
  ),
  rule(
    'sendemail',
    'Send Email',
    'outbound',
    'Can send email; inspect recipients, attachments, and input.'
  ),
  rule('share', 'Share', 'outbound', 'Shares data through a user-selected destination.'),
  rule('airdropdocument', 'AirDrop', 'outbound', 'Sends data to a nearby device over AirDrop.'),
  rule(
    'openurl',
    'Open URLs',
    'outbound',
    'Opens a URL, possibly handing data to another app or website.'
  ),
  rule(
    'setclipboard',
    'Copy to Clipboard',
    'outbound',
    'Copies data to the clipboard, where other apps can read it.'
  ),
  rule(
    'runapplescript',
    'Run AppleScript',
    'code-execution',
    'Runs AppleScript; embedded code is not inspected.'
  ),
  rule(
    'runjavascriptforautomation',
    'Run JavaScript for Automation',
    'code-execution',
    'Runs automation JavaScript; code is not inspected.'
  ),
  rule(
    'runjavascriptonwebpage',
    'Run JavaScript on Web Page',
    'code-execution',
    'Runs JavaScript on a web page; code is not inspected.'
  ),
  rule(
    'runshellscript',
    'Run Shell Script',
    'code-execution',
    'Runs shell commands; embedded code is not inspected.'
  ),
  rule(
    'runsshscript',
    'Run Script Over SSH',
    'code-execution',
    'Runs remote commands; host and code need manual review.'
  ),
  rule(
    'file.delete',
    'Delete Files',
    'destructive',
    'Can delete files; confirm scope and confirmation behavior.'
  ),
  rule(
    'deletephotos',
    'Delete Photos',
    'destructive',
    'Can delete photos; confirm scope and confirmation behavior.'
  ),
  rule(
    'runworkflow',
    'Run Shortcut',
    'dependency',
    'Calls another Shortcut whose contents were not inspected.'
  ),
];

const BASIC_ENTRIES: readonly CatalogEntry[] = [
  // Values and variables
  basic('gettext', 'Text'),
  basic('text', 'Text (legacy identifier)'),
  basic('comment', 'Comment'),
  basic('number', 'Number'),
  basic('url', 'URL'),
  basic('date', 'Date'),
  basic('dictionary', 'Dictionary'),
  basic('list', 'List'),
  basic('setvariable', 'Set Variable'),
  basic('getvariable', 'Get Variable'),
  basic('appendvariable', 'Add to Variable'),
  basic('nothing', 'Nothing'),
  // Control flow
  basic('conditional', 'If'),
  basic('choosefrommenu', 'Choose from Menu'),
  basic('repeat.count', 'Repeat'),
  basic('repeat.each', 'Repeat with Each'),
  basic('exit', 'Stop This Shortcut'),
  basic('output', 'Stop and Output'),
  basic('delay', 'Wait'),
  basic('waittoreturn', 'Wait to Return'),
  // Showing and asking
  basic('showresult', 'Show Result'),
  basic('alert', 'Show Alert'),
  basic('ask', 'Ask for Input'),
  basic('choosefromlist', 'Choose from List'),
  basic('notification', 'Show Notification'),
  basic('previewdocument', 'Quick Look'),
  basic('speaktext', 'Speak Text'),
  basic('vibrate', 'Vibrate Device'),
  // Math and numbers
  basic('math', 'Calculate'),
  basic('calculateexpression', 'Calculate Expression'),
  basic('round', 'Round Number'),
  basic('statistics', 'Calculate Statistics'),
  basic('number.random', 'Random Number'),
  basic('format.number', 'Format Number'),
  basic('measurement.create', 'Measurement'),
  basic('measurement.convert', 'Convert Measurement'),
  // Dates
  basic('adjustdate', 'Adjust Date'),
  basic('format.date', 'Format Date'),
  basic('gettimebetweendates', 'Get Time Between Dates'),
  basic('detect.date', 'Get Dates from Input'),
  // Text
  basic('text.replace', 'Replace Text'),
  basic('text.split', 'Split Text'),
  basic('text.combine', 'Combine Text'),
  basic('text.changecase', 'Change Case'),
  basic('text.match', 'Match Text'),
  basic('text.match.getgroup', 'Get Group from Matched Text'),
  basic('text.trimwhitespace', 'Trim Whitespace'),
  basic('correctspelling', 'Correct Spelling'),
  basic('detect.text', 'Get Text from Input'),
  basic('detect.number', 'Get Numbers from Input'),
  basic('detect.link', 'Get URLs from Input'),
  basic('detect.dictionary', 'Get Dictionary from Input'),
  basic('getrichtextfrommarkdown', 'Make Rich Text from Markdown'),
  basic('getmarkdownfromrichtext', 'Make Markdown from Rich Text'),
  basic('gethtmlfromrichtext', 'Make HTML from Rich Text'),
  basic('getrichtextfromhtml', 'Make Rich Text from HTML'),
  basic('base64encode', 'Base64 Encode'),
  basic('urlencode', 'URL Encode'),
  basic('hash', 'Generate Hash'),
  // Lists, dictionaries, and items
  basic('getitemfromlist', 'Get Item from List'),
  basic('getvalueforkey', 'Get Dictionary Value'),
  basic('setvalueforkey', 'Set Dictionary Value'),
  basic('count', 'Count'),
  basic('getitemname', 'Get Name'),
  basic('setitemname', 'Set Name'),
  basic('getitemtype', 'Get Type'),
  // Apps and device
  basic('openapp', 'Open App'),
  basic('getbatterylevel', 'Get Battery Level'),
  basic('setbrightness', 'Set Brightness'),
  basic('setvolume', 'Set Volume'),
];

export const CATALOG: readonly CatalogEntry[] = [...RULE_ENTRIES, ...BASIC_ENTRIES];

export const RULES: ReadonlyMap<string, Rule> = new Map(
  CATALOG.filter(entry => entry.category !== 'basic').map(({ id, category, message }) => [
    `${ACTION_PREFIX}${id}`,
    { category: category as RuleCategory, message: message as string },
  ])
);

export const BASIC_ACTIONS: ReadonlySet<string> = new Set(
  CATALOG.filter(entry => entry.category === 'basic').map(({ id }) => `${ACTION_PREFIX}${id}`)
);

/** Apple identifiers the catalog lacks are a coverage gap; anything else is a third-party intent. */
export function isAppleIdentifier(identifier: string): boolean {
  return identifier.startsWith(ACTION_PREFIX) || identifier.startsWith(APPLE_INTENT_PREFIX);
}
