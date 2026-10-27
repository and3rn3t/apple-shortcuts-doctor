import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { fixture, openApp, storageUsed, upload } from './helpers.ts';

const BUILD_MANIFEST = /\/\* @build \*\/\s*(\{[\s\S]*?\})\s*\/\* @end \*\//;

/** The cache name and file list the build put into sw.js. */
async function precacheList(
  request: APIRequestContext
): Promise<{ cache: string; files: string[] }> {
  const source = await (await request.get('/sw.js')).text();
  return JSON.parse(BUILD_MANIFEST.exec(source)?.[1] ?? 'null') as {
    cache: string;
    files: string[];
  };
}

test.describe('the offline worker', () => {
  test('is registered for the whole app', async ({ page }) => {
    await openApp(page);
    const registration = await page.evaluate(async () => {
      const found = await navigator.serviceWorker.getRegistration();
      return { scope: found?.scope, script: found?.active?.scriptURL };
    });
    expect(registration.scope).toBe(`${new URL(page.url()).origin}/`);
    expect(registration.script).toBe(`${new URL(page.url()).origin}/sw.js`);
  });

  test('precaches exactly the files of this build, in one cache named for the build', async ({
    page,
    request,
  }) => {
    await openApp(page);
    const build = await precacheList(request);
    expect(build.cache).toMatch(/^shortcuts-doctor-[0-9a-f]{12}$/);
    const names = await page.evaluate(() => caches.keys());
    expect(names).toEqual([build.cache]);
    const { cachedPaths } = await storageUsed(page);
    expect(cachedPaths).toEqual([...build.files].sort());
    // Everything the page needs is there; the platform's own files and the worker are not.
    expect(cachedPaths).toContain('/');
    expect(cachedPaths).toContain('/manifest.webmanifest');
    expect(cachedPaths.some(path => path.startsWith('/assets/') && path.endsWith('.js'))).toBe(
      true
    );
    expect(cachedPaths).not.toContain('/sw.js');
    expect(cachedPaths).not.toContain('/_headers');
  });

  test('is served under its own policy, while the page keeps the strict one', async ({
    request,
  }) => {
    const worker = await request.get('/sw.js');
    expect(worker.headers()['content-security-policy']).toBe(
      "default-src 'none'; connect-src 'self'"
    );
    expect(worker.headers()['content-type']).toMatch(/javascript/);
    // One policy only: the page rule was detached for the worker, not stacked with it.
    expect(
      worker.headersArray().filter(h => h.name.toLowerCase() === 'content-security-policy')
    ).toHaveLength(1);
    const page = await request.get('/');
    expect(page.headers()['content-security-policy']).toContain("connect-src 'none'");
  });
});

test.describe('the web app manifest', () => {
  test('describes an installable app whose icons are all served', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest'
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/json/);
    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect([manifest.name, manifest.start_url, manifest.display]).toEqual([
      'Shortcuts Doctor',
      '/',
      'standalone',
    ]);
    expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const served = await request.get(icon.src);
      expect(served.ok(), icon.src).toBe(true);
      expect(served.headers()['content-type'], icon.src).toContain(icon.type);
    }
  });
});

test.describe('working offline', () => {
  test('reloads, inspects an export, and downloads the report with the network off', async ({
    page,
    context,
  }) => {
    const watcher = await openApp(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Shortcuts Doctor' })).toBeVisible();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await page.setInputFiles('input[type=file]', upload('a.json', fixture('mixed-actions.json')));
    await expect(page.getByTestId('summary')).toContainText('Inspected 8 actions');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download Markdown report' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('shortcuts-doctor-report.md');
    expect(await watcher.violations()).toEqual([]);
  });

  test('is the worker that does it: with workers blocked, the same reload fails', async ({
    browser,
  }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Shortcuts Doctor' })).toBeVisible();
    await context.setOffline(true);
    await expect(page.reload()).rejects.toThrow();
    await context.close();
  });

  test('caches nothing else, whatever you do', async ({ page, context }) => {
    await openApp(page);
    const before = await storageUsed(page);
    expect(before.cachedPaths.length).toBeGreaterThan(5);

    await page.setInputFiles(
      'input[type=file]',
      upload('private-name.shortcut', fixture('mixed-actions.json'))
    );
    await expect(page.getByTestId('summary')).toBeVisible();
    await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download Markdown report' }).click(),
    ]);
    // Unknown routes, and a same-origin file the worker has never heard of, are not cached either.
    // (An image is a request the page's CSP allows, so it really reaches the worker; a fetch()
    // would be blocked by connect-src 'none' before it got there.)
    await page.goto('/some/route/that-is-not-precached');
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          const image = new Image();
          image.onload = image.onerror = () => resolve();
          image.src = '/private-export.png';
        })
    );
    await context.setOffline(false);

    const after = await storageUsed(page);
    expect(after.cachedPaths).toEqual(before.cachedPaths);
    for (const path of after.cachedPaths) {
      expect(path).not.toMatch(/private|some\/route|\.md$/);
    }
    expect(after.localStorage + after.sessionStorage + after.indexedDB).toBe(0);
  });
});
