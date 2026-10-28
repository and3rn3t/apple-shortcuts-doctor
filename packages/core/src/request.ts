import type { RequestShape } from './types.ts';

type JsonRecord = Record<string, unknown>;

const DOWNLOAD_URL = 'is.workflow.actions.downloadurl';
/** Shortcuts writes a variable into text as this placeholder character. */
const PLACEHOLDER = '￼';
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_TYPES: Record<string, RequestShape['body']> = {
  JSON: 'json',
  Form: 'form',
  File: 'file',
};
const BODY_PARAMETERS = ['WFJSONValues', 'WFFormValues', 'WFRequestVariable'];
const HOST_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

interface Text {
  /** The literal characters, with variables as placeholders. */
  string: string;
  hasVariables: boolean;
}

/** A plain string, or the text of a Shortcuts rich-text value; anything else is not text. */
function readText(value: unknown): Text | undefined {
  if (typeof value === 'string') return { string: value, hasVariables: false };
  if (!isRecord(value) || !isRecord(value.Value)) return undefined;
  const { string, attachmentsByRange } = value.Value;
  if (typeof string !== 'string') return undefined;
  const attached = isRecord(attachmentsByRange) && Object.keys(attachmentsByRange).length > 0;
  return { string, hasVariables: attached || string.includes(PLACEHOLDER) };
}

/** A value that is wholly one variable, such as a method chosen with a Shortcuts variable. */
function isVariable(value: unknown): boolean {
  return isRecord(value) && value.WFSerializationType === 'WFTextTokenAttachment';
}

function urlKind(parameters: JsonRecord): RequestShape['url'] {
  if (isVariable(parameters.WFURL)) return 'dynamic';
  const text = readText(parameters.WFURL);
  if (!text) return 'missing';
  return text.hasVariables ? 'dynamic' : 'literal';
}

function methodKind(parameters: JsonRecord): RequestShape['method'] {
  const method = parameters.WFHTTPMethod;
  if (method === undefined) return 'default';
  if (typeof method === 'string') {
    return METHODS.has(method) ? (method.toLowerCase() as RequestShape['method']) : 'other';
  }
  return isVariable(method) || readText(method)?.hasVariables ? 'dynamic' : 'other';
}

function bodyKind(parameters: JsonRecord): RequestShape['body'] {
  const type = parameters.WFHTTPBodyType;
  if (typeof type === 'string')
    return Object.hasOwn(BODY_TYPES, type) ? (BODY_TYPES[type] as RequestShape['body']) : 'unknown';
  if (type !== undefined) return 'unknown';
  return BODY_PARAMETERS.some(name => name in parameters) ? 'unknown' : 'none';
}

function headerCount(parameters: JsonRecord): number {
  const headers = parameters.WFHTTPHeaders;
  if (!isRecord(headers) || !isRecord(headers.Value)) return 0;
  const items = headers.Value.WFDictionaryFieldValueItems;
  return Array.isArray(items) ? items.length : 0;
}

/**
 * The hostname alone, and only when the text before the first variable already ends it: a host that
 * comes from a variable, an IPv6 literal, or anything with odd characters is left out. Credentials,
 * ports, paths, and queries are never read.
 */
function hostname(parameters: JsonRecord): string | undefined {
  const text = readText(parameters.WFURL);
  if (!text) return undefined;
  const placeholder = text.string.indexOf(PLACEHOLDER);
  const known = placeholder === -1 ? text.string : text.string.slice(0, placeholder);
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([/?#]?)/i.exec(known);
  if (!match) return undefined;
  const [, authority = '', delimiter = ''] = match;
  // A backslash ends the authority in an HTTP URL, so what follows is path text, not userinfo.
  if (authority.includes('\\')) return undefined;
  // Without a delimiter the host may continue into a variable.
  if (placeholder !== -1 && delimiter === '') return undefined;
  const host = (authority.split('@').pop() ?? '').replace(/:\d*$/, '').toLowerCase();
  return HOST_PATTERN.test(host) ? host : undefined;
}

/** Shape of a Get Contents of URL action: what kind of request, never any value in it. */
export function requestShape(
  identifier: string,
  parameters: JsonRecord,
  includeHosts: boolean
): RequestShape | undefined {
  if (identifier !== DOWNLOAD_URL) return undefined;
  const shape: RequestShape = {
    url: urlKind(parameters),
    method: methodKind(parameters),
    body: bodyKind(parameters),
    headers: headerCount(parameters),
  };
  const host = includeHosts ? hostname(parameters) : undefined;
  if (host) shape.host = host;
  return shape;
}
