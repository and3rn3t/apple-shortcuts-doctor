// Structural profile of Shortcut exports, for format research. Prints counts, Apple-defined key
// names, allowlisted Apple enum values, and validated action identifiers; anything else (user
// keys, parameter values, UUIDs, names, paths) is replaced by a placeholder.
// Usage: node scripts/profile-exports.mjs <file-or-directory>... > profile.json
import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

// Import by URL: a Windows drive-letter path is not a valid ESM specifier.
const bundle = await import(
  new URL('../skills/shortcuts-doctor/scripts/inspect-shortcut.mjs', import.meta.url).href
);
const { inspectWorkflow, parseExport, readExport } = bundle;

const EXTENSIONS = new Set(['.shortcut', '.plist', '.json', '.wflow']);
const RANGE_KEY = /^\{\d+, ?\d+\}$/;
/** Apple's parameter and workflow keys are `WF`-prefixed; the rest of the structure is fixed. */
const APPLE_KEY = /^(?:Show-)?WF[A-Z][A-Za-z0-9]{0,60}$/;
const STRUCTURAL_KEYS = new Set([
  'Value',
  'Type',
  'UUID',
  'OutputUUID',
  'OutputName',
  'VariableName',
  'Aggrandizements',
  'attachmentsByRange',
  'string',
  'GroupingIdentifier',
  'CustomOutputName',
  'Input',
  'ShowHeaders',
  'Advanced',
  'PropertyName',
  'PropertyUserInfo',
  'CoercionItemClass',
  'DictionaryKey',
  'ShowWhenRun',
  'SelectMultiple',
  'AppIntentDescriptor',
]);
/** Field-specific shapes of Apple enum values; anything else is reported as `<other>`. */
const VERSION = /^\d{1,6}(?:\.\d{1,6}){0,4}$/;
const ENUM_SHAPES = {
  Type: /^(?:Variable|ActionOutput|ExtensionInput|CurrentDate|Ask|Clipboard|DeviceDetails|WF[A-Za-z]{1,60}Aggrandizement)$/,
  WFSerializationType: /^WF[A-Z][A-Za-z]{1,60}$/,
  WFControlFlowMode: /^[0-2]$/,
  WFWorkflowClientVersion: VERSION,
  WFWorkflowClientRelease: VERSION,
  WFWorkflowMinimumClientVersion: VERSION,
  WFWorkflowMinimumClientVersionString: VERSION,
  WFWorkflowTypes: /^[A-Za-z]{1,40}$/,
  WFWorkflowInputContentItemClasses: /^WF[A-Za-z]{0,60}ContentItem$/,
  WFWorkflowOutputContentItemClasses: /^WF[A-Za-z]{0,60}ContentItem$/,
  WFQuickActionSurfaces: /^[A-Za-z]{1,40}$/,
  WFWorkflowHasOutputFallback: /^(?:true|false)$/,
  WFWorkflowHasShortcutInputVariables: /^(?:true|false)$/,
  WFWorkflowNoInputBehavior: /^<other>$/,
};
/** Parameter keys that carry references or control flow; their presence (not value) is counted. */
const REFERENCE_KEYS = new Set(['OutputUUID', 'OutputName', 'VariableName', 'Aggrandizements']);
/** Parameter keys whose values are small Apple enums. */
const ENUM_PARAMETER_KEYS = new Set(['Type', 'WFSerializationType', 'WFControlFlowMode']);

/** @typedef {Record<string, number>} Counts */
/** @typedef {Record<string, unknown>} JsonRecord */
/**
 * @typedef {object} Profile
 * @property {number} files
 * @property {Counts} containers
 * @property {Counts} decodeErrors
 * @property {Counts} inspectErrors
 * @property {number} inspected
 * @property {Counts} topLevelKeys
 * @property {Record<string, Counts>} topLevelTypes
 * @property {Record<string, Counts>} enumValues
 * @property {{ workflows: number, questions: number }} importQuestions
 * @property {number[]} actionCounts
 * @property {number} overActionLimit
 * @property {Counts} identifiers
 * @property {number} rejectedIdentifiers
 * @property {Counts} categories
 * @property {Record<string, Counts>} parameterKeysByIdentifier
 * @property {Record<string, Counts>} enumParameterValues
 * @property {Counts} referenceKeys
 * @property {Record<string, Counts>} referencePaths
 */

/**
 * A value is printed only if it has the shape Apple uses for that field; otherwise `<other>`.
 * @param {keyof typeof ENUM_SHAPES} field
 * @param {unknown} value
 * @returns {string}
 */
function enumToken(field, value) {
  const text = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
  return typeof text === 'string' && ENUM_SHAPES[field].test(text) ? text : '<other>';
}

/**
 * Keys are printed only if Apple defines them; user-defined keys (UUIDs, names) become `<key>`.
 * @param {string} key
 * @returns {string}
 */
function keyToken(key) {
  if (RANGE_KEY.test(key)) return '{range}';
  return APPLE_KEY.test(key) || STRUCTURAL_KEYS.has(key) ? key : '<key>';
}

/** Prototype-less, so keys such as `constructor` or `__proto__` count like any other. @returns {Counts} */
function dict() {
  return /** @type {Counts} */ (Object.create(null));
}

/** @param {Counts} map @param {string} key @param {number} [by] */
function count(map, key, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

/** @param {Record<string, Counts>} map @param {string} key @returns {Counts} */
function child(map, key) {
  return (map[key] ??= dict());
}

/** @param {unknown} value @returns {string} */
function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value instanceof Uint8Array) return 'data';
  if (value instanceof Date) return 'date';
  return value === null ? 'null' : typeof value;
}

/**
 * @param {unknown} value
 * @returns {value is JsonRecord}
 */
function isRecord(value) {
  return typeOf(value) === 'object';
}

/** @param {string[]} paths @returns {string[]} */
function listFiles(paths) {
  return paths.flatMap(path => {
    // statSync/readdirSync errors quote the path; callers replace them with a fixed message.
    if (statSync(path).isDirectory()) {
      return listFiles(readdirSync(path).map(name => join(path, name)));
    }
    return EXTENSIONS.has(extname(path).toLowerCase()) ? [path] : [];
  });
}

/** @param {Uint8Array} bytes @returns {string} */
function containerOf(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 8)).trimStart();
  if (head.startsWith('AEA1')) return 'signed-aea';
  if (head.startsWith('bplist00')) return 'binary-plist';
  if (head.startsWith('<')) return 'xml-plist';
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  return 'other';
}

/** @returns {Profile} */
function createProfile() {
  return {
    files: 0,
    containers: dict(),
    decodeErrors: dict(),
    inspectErrors: dict(),
    inspected: 0,
    topLevelKeys: dict(),
    topLevelTypes: Object.create(null),
    enumValues: Object.create(null),
    importQuestions: { workflows: 0, questions: 0 },
    actionCounts: [],
    overActionLimit: 0,
    identifiers: dict(),
    rejectedIdentifiers: 0,
    categories: dict(),
    parameterKeysByIdentifier: Object.create(null),
    enumParameterValues: Object.create(null),
    referenceKeys: dict(),
    referencePaths: Object.create(null),
  };
}

/** @param {JsonRecord} workflow @param {Profile} profile */
function profileTopLevel(workflow, profile) {
  for (const [key, value] of Object.entries(workflow)) {
    const name = keyToken(key);
    count(profile.topLevelKeys, name);
    count(child(profile.topLevelTypes, name), typeOf(value));
    if (!Object.hasOwn(ENUM_SHAPES, key)) continue;
    const field = /** @type {keyof typeof ENUM_SHAPES} */ (key);
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) count(child(profile.enumValues, key), enumToken(field, item));
  }
  const questions = workflow.WFWorkflowImportQuestions;
  if (Array.isArray(questions) && questions.length) {
    profile.importQuestions.workflows++;
    profile.importQuestions.questions += questions.length;
  }
}

/**
 * Records where reference keys sit beneath each serialization type, as normalized key paths.
 * @param {unknown} value
 * @param {string[]} path
 * @param {string | undefined} serialization
 * @param {Profile} profile
 */
function walkParameters(value, path, serialization, profile) {
  if (Array.isArray(value)) {
    for (const item of value) walkParameters(item, [...path, '[]'], serialization, profile);
    return;
  }
  if (!isRecord(value)) return;
  const type =
    'WFSerializationType' in value
      ? enumToken('WFSerializationType', value.WFSerializationType)
      : undefined;
  const scope = type ?? serialization;
  const base = type ? [] : path;
  for (const [key, inner] of Object.entries(value)) {
    if (ENUM_PARAMETER_KEYS.has(key)) {
      const field = /** @type {'Type' | 'WFSerializationType' | 'WFControlFlowMode'} */ (key);
      count(child(profile.enumParameterValues, key), enumToken(field, inner));
    }
    if (REFERENCE_KEYS.has(key)) {
      count(profile.referenceKeys, key);
      count(child(profile.referencePaths, scope ?? '<none>'), [...base, key].join('.'));
    }
    walkParameters(inner, [...base, keyToken(key)], scope, profile);
  }
}

/** @param {string} identifier @returns {boolean} */
function identifierAccepted(identifier) {
  try {
    inspectWorkflow({ WFWorkflowActions: [{ WFWorkflowActionIdentifier: identifier }] });
    return true;
  } catch {
    return false;
  }
}

/** @param {unknown[]} actions @param {Profile} profile */
function profileActions(actions, profile) {
  profile.actionCounts.push(actions.length);
  if (actions.length > 2000) profile.overActionLimit++;
  for (const action of actions) {
    if (!isRecord(action)) continue;
    const identifier = action.WFWorkflowActionIdentifier;
    // Only identifiers the inspector accepts are named; anything else could be arbitrary text.
    const valid = typeof identifier === 'string' && identifierAccepted(identifier);
    if (!valid) profile.rejectedIdentifiers++;
    const id = valid ? identifier : '<rejected>';
    count(profile.identifiers, id);
    const parameters = action.WFWorkflowActionParameters;
    if (!isRecord(parameters)) continue;
    const keys = child(profile.parameterKeysByIdentifier, id);
    for (const key of Object.keys(parameters)) count(keys, keyToken(key));
    walkParameters(parameters, [], undefined, profile);
  }
}

/** @param {JsonRecord} workflow @param {Profile} profile */
function profileReport(workflow, profile) {
  try {
    const report = inspectWorkflow(workflow);
    profile.inspected++;
    for (const action of report.actions) count(profile.categories, action.category);
  } catch (error) {
    count(profile.inspectErrors, /** @type {Error} */ (error).message);
  }
}

/** @param {string} file @param {Profile} profile */
function profileFile(file, profile) {
  profile.files++;
  let workflow;
  try {
    const bytes = readExport(file);
    count(profile.containers, containerOf(bytes));
    workflow = parseExport(bytes);
  } catch (error) {
    // Error messages from readExport/parseExport are fixed and content-free; codes hide paths.
    const { code, message } = /** @type {Error & { code?: string }} */ (error);
    count(profile.decodeErrors, code ? 'Cannot read the file.' : message);
    return;
  }
  if (!isRecord(workflow)) return;
  profileTopLevel(workflow, profile);
  if (Array.isArray(workflow.WFWorkflowActions))
    profileActions(workflow.WFWorkflowActions, profile);
  profileReport(workflow, profile);
}

/** @param {Counts} map @returns {Counts} */
function sortByCount(map) {
  return Object.fromEntries(
    Object.entries(map).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
  );
}

/** @param {number[]} counts */
function summarizeCounts(counts) {
  const sorted = [...counts].sort((a, b) => a - b);
  if (!sorted.length) return { workflows: 0 };
  const at = (/** @type {number} */ fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  return {
    workflows: sorted.length,
    min: sorted[0],
    median: at(0.5),
    p90: at(0.9),
    max: sorted.at(-1),
  };
}

/** @param {Profile} profile @returns {JsonRecord} */
function finalize(profile) {
  const nested = [
    'topLevelTypes',
    'enumValues',
    'parameterKeysByIdentifier',
    'enumParameterValues',
    'referencePaths',
  ];
  /** @type {JsonRecord} */
  const result = { ...profile, actionCounts: summarizeCounts(profile.actionCounts) };
  for (const [key, value] of Object.entries(result)) {
    if (!isRecord(value) || key === 'importQuestions' || key === 'actionCounts') continue;
    result[key] = nested.includes(key)
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, inner]) => [name, sortByCount(/** @type {Counts} */ (inner))])
        )
      : sortByCount(/** @type {Counts} */ (value));
  }
  return result;
}

const inputs = process.argv.slice(2);
if (!inputs.length) {
  process.stderr.write('Usage: node scripts/profile-exports.mjs <file-or-directory>...\n');
  process.exit(1);
}
/** @type {string[]} */
let files;
try {
  files = listFiles(inputs);
} catch {
  process.stderr.write('Cannot read an input path. Check that each path exists and is readable.\n');
  process.exit(1);
}
const profile = createProfile();
for (const file of files) profileFile(file, profile);
process.stdout.write(`${JSON.stringify(finalize(profile), null, 2)}\n`);
