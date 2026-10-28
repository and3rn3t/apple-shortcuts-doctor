type JsonRecord = Record<string, unknown>;

export type SecretKind = 'format' | 'named' | 'entropy';

/** Shortcuts writes a variable into text as this placeholder, so it splits literal text apart. */
const PLACEHOLDER = '￼';
const MAX_ENTROPY_TOKEN = 200;
const MIN_ENTROPY_TOKEN = 24;
const MIN_HEX_TOKEN = 32;

/** Structural keys hold identifiers, not user content. */
const SKIP_KEYS = new Set([
  'UUID',
  'OutputUUID',
  'GroupingIdentifier',
  'WFWorkflowActionIdentifier',
  'Type',
  'WFSerializationType',
  'VariableName',
  'OutputName',
]);

/** Well-known credential shapes. Each is anchored on a literal prefix so scanning stays linear. */
const TOKEN_FORMATS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /xox[abprs]-[A-Za-z0-9-]{20,}/,
  /sk_live_[A-Za-z0-9]{16,}/,
  /sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----/,
  /\b(?:Bearer|Basic) [A-Za-z0-9._~+/=-]{20,}/,
  /[a-z][a-z0-9+.-]{0,20}:\/\/[^\s/:@]{1,100}:[^\s/@]{3,100}@/i,
];

const SECRET_NAME =
  /api[-_ ]?key|apikey|secret|passw(?:or)?d|passwd|pwd|token|authorization|auth[-_ ]?key|bearer|private[-_ ]?key|access[-_ ]?key/i;
const SECRET_IN_QUERY =
  /[?&;](?:api[-_]?key|apikey|access[-_]?token|token|secret|password|passwd|auth|key)=([^&\s#]{8,})/gi;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_SCHEME = /^(?:Bearer|Basic|Token)\s+/i;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The literal characters of a plain string or a Shortcuts rich-text value. */
function readText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (isRecord(value) && isRecord(value.Value) && typeof value.Value.string === 'string') {
    return value.Value.string;
  }
  return undefined;
}

/** Long enough and not an ordinary word: something that could be a password or key. */
function looksLikeSecretValue(raw: string): boolean {
  const value = raw.trim().replace(AUTH_SCHEME, '');
  if (value.length < 8 || value.length > 2048 || /\s/.test(value) || value.includes(PLACEHOLDER)) {
    return false;
  }
  return (
    /\d/.test(value) || (/[A-Z]/.test(value) && /[a-z]/.test(value)) || /[^A-Za-z0-9]/.test(value)
  );
}

function shannonEntropy(token: string): number {
  const counts = new Map<string, number>();
  for (const character of token) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / token.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function looksRandom(token: string): boolean {
  if (token.length > MAX_ENTROPY_TOKEN || UUID.test(token)) return false;
  const hasDigit = /\d/.test(token);
  const hasLetter = /[A-Za-z]/.test(token);
  if (!hasDigit || !hasLetter) return false;
  if (/^[0-9a-f]+$/i.test(token))
    return token.length >= MIN_HEX_TOKEN && shannonEntropy(token) >= 3;
  return token.length >= MIN_ENTROPY_TOKEN && shannonEntropy(token) >= 4;
}

/**
 * Only a value that is nothing but one token counts: a long run inside a URL, a sentence, or an
 * encoded blob is far more often an identifier or data than a credential (on 138 real exports,
 * scanning runs inside text flagged 40% of Shortcuts; whole-value tokens flag 15%).
 */
function isWholeRandomToken(text: string): boolean {
  const token = text.trim();
  return /^[A-Za-z0-9_-]{24,200}$/.test(token) && looksRandom(token);
}

function matchesTokenFormat(text: string): boolean {
  return TOKEN_FORMATS.some(format => format.test(text));
}

function hasSecretInQuery(text: string): boolean {
  for (const match of text.matchAll(SECRET_IN_QUERY)) {
    if (looksLikeSecretValue(match[1] ?? '')) return true;
  }
  return false;
}

/** A dictionary entry whose user-chosen key names a secret and whose value is a literal one. */
function isNamedSecretEntry(entry: JsonRecord): boolean {
  const key = readText(entry.WFKey);
  const value = readText(entry.WFValue);
  if (key === undefined || value === undefined) return false;
  return SECRET_NAME.test(key) && looksLikeSecretValue(value);
}

/**
 * Looks through an action's parameters for hardcoded credentials: known token shapes, dictionary
 * entries (headers, JSON fields) named like a secret with a literal value, and long random-looking
 * strings. It returns only which kinds were seen: never the text, a prefix, or a length.
 */
export function findSecretKinds(parameters: JsonRecord): Set<SecretKind> {
  const kinds = new Set<SecretKind>();
  const stack: { value: unknown; key: string | undefined }[] = [
    { value: parameters, key: undefined },
  ];
  while (stack.length) {
    const { value, key } = stack.pop() as { value: unknown; key: string | undefined };
    if (typeof value === 'string') {
      if (key !== undefined && SKIP_KEYS.has(key)) continue;
      for (const part of value.split(PLACEHOLDER)) {
        if (matchesTokenFormat(part)) kinds.add('format');
        else if (hasSecretInQuery(part)) kinds.add('named');
        else if (isWholeRandomToken(part)) kinds.add('entropy');
      }
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value as unknown[]) stack.push({ value: item, key });
      continue;
    }
    if (!isRecord(value)) continue;
    if (isNamedSecretEntry(value)) kinds.add('named');
    for (const [childKey, child] of Object.entries(value))
      stack.push({ value: child, key: childKey });
  }
  // A string already explained by a stronger kind is not also reported as merely random.
  if (kinds.has('format') || kinds.has('named')) kinds.delete('entropy');
  return kinds;
}

const MESSAGES: Record<SecretKind, string> = {
  format:
    'This action seems to contain a hardcoded secret, such as a token, key, or password. The value is not shown; keep secrets out of the Shortcut.',
  named:
    'This action seems to contain a hardcoded secret, such as a token, key, or password. The value is not shown; keep secrets out of the Shortcut.',
  entropy:
    'This action contains a long random-looking string that may be a hardcoded secret. The value is not shown; check it and keep secrets out of the Shortcut.',
};

export const SECRET_RULES: Record<
  SecretKind,
  { ruleId: string; severity: 'warning' | 'review'; message: string }
> = {
  format: { ruleId: 'secret-token-format', severity: 'warning', message: MESSAGES.format },
  named: { ruleId: 'secret-named-field', severity: 'warning', message: MESSAGES.named },
  entropy: { ruleId: 'secret-high-entropy', severity: 'review', message: MESSAGES.entropy },
};
