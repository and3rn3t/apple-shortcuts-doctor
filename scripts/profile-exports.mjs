// Structural profile of Shortcut exports, for format research. Prints counts, key names, Apple
// enum-like values, and action identifiers; never parameter values, UUIDs, names, or paths.
// Usage: node scripts/profile-exports.mjs <file-or-directory>... > profile.json
import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = await import(
  fileURLToPath(new URL('../skills/shortcuts-doctor/scripts/inspect-shortcut.mjs', import.meta.url))
);
const { inspectWorkflow, parseExport, readExport } = bundle;

const EXTENSIONS = new Set(['.shortcut', '.plist', '.json', '.wflow']);
const SAFE_TOKEN = /^[A-Za-z0-9._-]{1,80}$/;
const RANGE_KEY = /^\{\d+, ?\d+\}$/;
/** Top-level keys whose values are Apple enums, versions, or flags rather than user content. */
const ENUM_KEYS = new Set([
  'WFWorkflowClientVersion',
  'WFWorkflowClientRelease',
  'WFWorkflowMinimumClientVersion',
  'WFWorkflowMinimumClientVersionString',
  'WFWorkflowTypes',
  'WFWorkflowInputContentItemClasses',
  'WFWorkflowOutputContentItemClasses',
  'WFQuickActionSurfaces',
  'WFWorkflowHasOutputFallback',
  'WFWorkflowHasShortcutInputVariables',
  'WFWorkflowNoInputBehavior',
]);
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
 * @property {Counts} rejectedIdentifiers
 * @property {Counts} categories
 * @property {Record<string, Counts>} parameterKeysByIdentifier
 * @property {Record<string, Counts>} enumParameterValues
 * @property {Counts} referenceKeys
 * @property {Record<string, Counts>} referencePaths
 */

/**
 * Any value from untrusted content is reduced to a safe token or a placeholder.
 * @param {unknown} value
 * @returns {string}
 */
function token(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : '<other>';
}

/** @param {string} key @returns {string} */
function keyToken(key) {
  if (RANGE_KEY.test(key)) return '{range}';
  return SAFE_TOKEN.test(key) ? key : '<key>';
}

/** @param {Counts} map @param {string} key @param {number} [by] */
function count(map, key, by = 1) {
  map[key] = (map[key] ?? 0) + by;
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
    containers: {},
    decodeErrors: {},
    inspectErrors: {},
    inspected: 0,
    topLevelKeys: {},
    topLevelTypes: {},
    enumValues: {},
    importQuestions: { workflows: 0, questions: 0 },
    actionCounts: [],
    overActionLimit: 0,
    identifiers: {},
    rejectedIdentifiers: {},
    categories: {},
    parameterKeysByIdentifier: {},
    enumParameterValues: {},
    referenceKeys: {},
    referencePaths: {},
  };
}

/** @param {JsonRecord} workflow @param {Profile} profile */
function profileTopLevel(workflow, profile) {
  for (const [key, value] of Object.entries(workflow)) {
    const name = keyToken(key);
    count(profile.topLevelKeys, name);
    count((profile.topLevelTypes[name] ??= {}), typeOf(value));
    if (!ENUM_KEYS.has(key)) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) count((profile.enumValues[name] ??= {}), token(item));
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
    typeof value.WFSerializationType === 'string' ? token(value.WFSerializationType) : undefined;
  const scope = type ?? serialization;
  const base = type ? [] : path;
  for (const [key, child] of Object.entries(value)) {
    if (ENUM_PARAMETER_KEYS.has(key))
      count((profile.enumParameterValues[key] ??= {}), token(child));
    if (REFERENCE_KEYS.has(key)) {
      count(profile.referenceKeys, key);
      count((profile.referencePaths[scope ?? '<none>'] ??= {}), [...base, key].join('.'));
    }
    walkParameters(child, [...base, keyToken(key)], scope, profile);
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
    const id =
      typeof identifier === 'string' && identifier.length <= 200 ? identifier : '<invalid>';
    count(profile.identifiers, id);
    if (id !== '<invalid>' && !identifierAccepted(id)) count(profile.rejectedIdentifiers, id);
    const parameters = action.WFWorkflowActionParameters;
    if (!isRecord(parameters)) continue;
    const keys = (profile.parameterKeysByIdentifier[id] ??= {});
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
            .sort()
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
const profile = createProfile();
for (const file of listFiles(inputs)) profileFile(file, profile);
process.stdout.write(`${JSON.stringify(finalize(profile), null, 2)}\n`);
