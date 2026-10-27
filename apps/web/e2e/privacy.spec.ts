import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { fixture, openApp, storageUsed, upload, watch } from './helpers.ts';

/** The headers shipped in public/_headers for `/*`, by lower-cased name. */
function shippedHeaders(): Map<string, string> {
  const text = readFileSync(join(import.meta.dirname, '../public/_headers'), 'utf8');
  const headers = new Map<string, string>();
  let inCatchAll = false;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inCatchAll = line.trim() === '/*';
      continue;
    }
    const separator = line.indexOf(':');
    if (inCatchAll && separator > 0) {
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }
  }
  return headers;
}

test.describe('response headers', () => {
  test('the page and its assets are served with exactly the shipped policy', async ({
    request,
  }) => {
    const shipped = shippedHeaders();
    expect(shipped.get('content-security-policy')).toContain("connect-src 'none'");
    const page = await request.get('/');
    const html = await page.text();
    const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(script).toBeTruthy();
    const asset = await request.get(script as string);
    for (const response of [page, asset]) {
      for (const [name, value] of shipped) expect(response.headers()[name], name).toBe(value);
    }
  });

  test('the _headers file itself is not served', async ({ request }) => {
    const response = await request.get('/_headers');
    expect(await response.text()).not.toContain('Content-Security-Policy');
  });
});

test.describe('the policy is enforced by the browser', () => {
  test('blocks connections, inline scripts, remote scripts, blob scripts, and remote images', async ({
    page,
  }) => {
    const watcher = await openApp(page);
    const outcome = await page.evaluate(async () => {
      const result: Record<string, string> = {};
      try {
        await fetch('/');
        result.fetch = 'allowed';
      } catch {
        result.fetch = 'blocked';
      }
      const inline = document.createElement('script');
      inline.textContent = 'window.__ran = true;';
      document.head.append(inline);
      result.inline = (window as unknown as { __ran?: boolean }).__ran ? 'ran' : 'blocked';
      const remote = document.createElement('script');
      remote.src = 'https://example.invalid/a.js';
      document.head.append(remote);
      const blob = document.createElement('script');
      blob.src = URL.createObjectURL(
        new Blob(['window.__blobRan = true'], { type: 'text/javascript' })
      );
      document.head.append(blob);
      new Image().src = 'https://example.invalid/pixel.png';
      new WebSocket('wss://example.invalid/socket');
      await new Promise(resolve => setTimeout(resolve, 500));
      return result;
    });
    expect(outcome).toEqual({ fetch: 'blocked', inline: 'blocked' });
    const violations = (await watcher.violations()).map(entry => entry.split(' -> ')[0]);
    for (const directive of ['connect-src', 'script-src-elem', 'img-src']) {
      expect(violations, directive).toContain(directive);
    }
  });
});

test.describe('an inspected export stays in the page', () => {
  // Specific values from the fixtures. (Not words like "OutputUUID", which core's fixed limitations
  // text legitimately contains.)
  const secrets = ['private-name', 'example.invalid', 'echo fixture', 'Fixture: mixed'];

  for (const [label, name] of [
    ['JSON', 'mixed-actions.json'],
    ['XML plist', 'mixed-actions.plist'],
    ['binary plist', 'mixed-actions.binary.plist'],
  ] as const) {
    test(`inspecting a ${label} export makes no request, stores nothing, and shows no values`, async ({
      page,
    }) => {
      const watcher = await openApp(page);
      await page.setInputFiles('input[type=file]', upload('private-name.shortcut', fixture(name)));
      await expect(page.getByRole('heading', { name: 'Report' })).toBeVisible();
      await expect(page.getByTestId('summary')).toContainText('Inspected 8 actions');
      const dom = await page.content();
      for (const secret of secrets) expect(dom, secret).not.toContain(secret);
      expect(watcher.requestsSinceMark()).toEqual([]);
      expect(await watcher.violations()).toEqual([]);
      expect(watcher.consoleErrors).toEqual([]);
      expect(await storageUsed(page)).toEqual({
        localStorage: 0,
        sessionStorage: 0,
        indexedDB: 0,
        cacheStorage: 0,
      });
    });
  }

  test('a refused file (signed, oversized, malformed) also makes no request', async ({ page }) => {
    const watcher = await openApp(page);
    for (const file of [
      upload('private-name.shortcut', 'AEA1 signed payload'),
      upload('private-name.json', Buffer.alloc(5 * 1024 * 1024, 0x20)),
      upload('private-name.json', '{"private-key": "private-value", '),
    ]) {
      await page.setInputFiles('input[type=file]', file);
      await expect(page.getByRole('alert')).toBeVisible();
    }
    const dom = await page.content();
    for (const secret of ['private-name', 'private-key', 'private-value']) {
      expect(dom, secret).not.toContain(secret);
    }
    expect(watcher.requestsSinceMark()).toEqual([]);
    expect(await watcher.violations()).toEqual([]);
  });

  test('the watcher itself sees a request when one happens (so "none" means none)', async ({
    page,
  }) => {
    const watcher = await watch(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(watcher.requestsSinceMark().length).toBeGreaterThan(1);
    expect(watcher.requestsSinceMark().some(url => url.endsWith('.js'))).toBe(true);
  });
});
