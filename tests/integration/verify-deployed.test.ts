// @vitest-environment node
// scripts/verify-deployed.mjs: proves a deployment serves the build byte-for-byte with its headers.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/verify-deployed.mjs', import.meta.url));
const CSP = "default-src 'none'; connect-src 'none'";
const WORKER_CSP = "default-src 'none'; connect-src 'self'";
const HEADERS = `# comment
/*
  Content-Security-Policy: ${CSP}
  X-Content-Type-Options: nosniff
/sw.js
  ! Content-Security-Policy
  Content-Security-Policy: ${WORKER_CSP}
`;
const FILES: Record<string, string> = {
  'index.html': '<!doctype html><title>app</title>',
  'assets/app.js': 'export const a = 1;',
  'sw.js': 'self.skipWaiting();',
};

interface Served {
  status: number;
  body: string;
  headers: Record<string, string>;
}
type Handler = (path: string, request: number) => Served | undefined;

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  await Promise.all(servers.splice(0).map(server => new Promise(done => server.close(done))));
});

function dist(files: Record<string, string> = FILES, headers = HEADERS): string {
  const root = mkdtempSync(join(tmpdir(), 'verify-deployed-'));
  roots.push(root);
  for (const [name, content] of Object.entries({ ...files, _headers: headers })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}

/** The correct deployment: what `FILES` and `HEADERS` promise. */
function faithful(path: string): Served | undefined {
  const file = path === '/' ? 'index.html' : path.slice(1);
  const body = FILES[file];
  if (body === undefined) return undefined;
  return {
    status: 200,
    body,
    headers: {
      'content-security-policy': file === 'sw.js' ? WORKER_CSP : CSP,
      'x-content-type-options': 'nosniff',
    },
  };
}

async function serve(handler: Handler): Promise<string> {
  let count = 0;
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    count += 1;
    const served = handler(request.url ?? '/', count) ?? { status: 404, body: 'nope', headers: {} };
    response.writeHead(served.status, served.headers);
    response.end(served.body);
  });
  servers.push(server);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

interface Run {
  code: number | null;
  out: string;
}

function run(args: string[]): Promise<Run> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    child.on('close', code => resolve({ code, out }));
  });
}

const quick = ['--timeout', '1', '--interval', '0.2'];

describe('verify-deployed', () => {
  it('passes when every file is served identically with its headers', async () => {
    const result = await run([await serve(path => faithful(path)), dist(), ...quick]);
    expect(result.out).toContain('verify-deployed: ok');
    expect(result.code).toBe(0);
  });

  it('fails when a served body differs from the build', async () => {
    const base = await serve(path => {
      const served = faithful(path);
      return path === '/' && served ? { ...served, body: served.body + '<script src=x>' } : served;
    });
    const result = await run([base, dist(), ...quick]);
    expect(result.out).toContain('/: served bytes differ from the build');
    expect(result.code).toBe(1);
  });

  it('fails when an expected header is missing or wrong', async () => {
    const base = await serve(path => {
      const served = faithful(path);
      if (!served) return served;
      if (path === '/') delete served.headers['content-security-policy'];
      if (path === '/assets/app.js') served.headers['x-content-type-options'] = 'sniff';
      return served;
    });
    const result = await run([base, dist(), ...quick]);
    expect(result.out).toContain('/: header content-security-policy is missing');
    expect(result.out).toContain('/assets/app.js: header x-content-type-options is "sniff"');
    expect(result.code).toBe(1);
  });

  it('fails when a file is not served', async () => {
    const base = await serve(path => (path === '/assets/app.js' ? undefined : faithful(path)));
    const result = await run([base, dist(), ...quick]);
    expect(result.out).toContain('/assets/app.js: HTTP 404');
    expect(result.code).toBe(1);
  });

  it('requires the service worker to carry its own policy, not the page one', async () => {
    const base = await serve(path => {
      const served = faithful(path);
      if (path === '/sw.js' && served) served.headers['content-security-policy'] = CSP;
      return served;
    });
    const result = await run([base, dist(), ...quick]);
    expect(result.out).toContain(`/sw.js: header content-security-policy is "${CSP}"`);
    expect(result.code).toBe(1);
  });

  it('honours a detach: the header must be absent where the rule removes it', async () => {
    const headers = `/*\n  X-Frame-Options: DENY\n/sw.js\n  ! X-Frame-Options\n`;
    const withFrame = (path: string): Served | undefined => {
      const served = faithful(path);
      return served ? { ...served, headers: { 'x-frame-options': 'DENY' } } : served;
    };
    const absent = await serve(path => {
      const served = withFrame(path);
      if (path === '/sw.js' && served) served.headers = {};
      return served;
    });
    expect((await run([absent, dist(FILES, headers), ...quick])).code).toBe(0);
    const present = await serve(path => withFrame(path));
    const result = await run([present, dist(FILES, headers), ...quick]);
    expect(result.out).toContain('/sw.js: header x-frame-options is "DENY", expected absent');
    expect(result.code).toBe(1);
  });

  it('keeps polling until the deployment arrives', async () => {
    const base = await serve((path, request) => (request <= 3 ? undefined : faithful(path)));
    const result = await run([base, dist(), '--timeout', '10', '--interval', '0.2']);
    expect(result.out).toContain('not yet');
    expect(result.out).toContain('verify-deployed: ok');
    expect(result.code).toBe(0);
  });

  it('fails when the site cannot be reached', async () => {
    const result = await run(['http://127.0.0.1:1', dist(), ...quick]);
    expect(result.out).toContain('request failed');
    expect(result.code).toBe(1);
  });

  it('refuses a _headers path it cannot interpret instead of skipping it', async () => {
    const result = await run([
      'http://127.0.0.1:1',
      dist(FILES, '/assets/*\n  X-A: b\n'),
      ...quick,
    ]);
    expect(result.out).toContain('unsupported _headers path');
    expect(result.code).not.toBe(0);
  });

  it('rejects bad arguments', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['http://x', dist(), '--timeout', '0'])).code).toBe(2);
    expect((await run(['http://x', dist(), '--bogus'])).code).toBe(2);
  });
});
