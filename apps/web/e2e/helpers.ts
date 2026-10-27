import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

const FIXTURES = join(import.meta.dirname, '../../../tests/fixtures');

export const fixture = (name: string): Buffer => readFileSync(join(FIXTURES, name));

export const upload = (
  name: string,
  buffer: Buffer | string
): Parameters<Page['setInputFiles']>[1] => ({
  name,
  mimeType: 'application/octet-stream',
  buffer: Buffer.from(buffer),
});

export interface Watch {
  /** Call once the page has loaded and gone idle; later requests are the ones that matter. */
  mark: () => void;
  requestsSinceMark: () => string[];
  consoleErrors: string[];
  violations: () => Promise<string[]>;
}

type WithViolations = Window & { __violations?: string[] };

/** Records requests, console errors, and CSP violations for the whole life of the page. */
export async function watch(page: Page): Promise<Watch> {
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  let marked = 0;
  page.on('request', request => requests.push(request.url()));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.addInitScript(() => {
    const store: string[] = ((window as WithViolations).__violations = []);
    document.addEventListener('securitypolicyviolation', event => {
      store.push(`${event.effectiveDirective} -> ${event.blockedURI || '(inline)'}`);
    });
  });
  return {
    mark: () => {
      marked = requests.length;
    },
    requestsSinceMark: () => requests.slice(marked),
    consoleErrors,
    violations: () => page.evaluate(() => (window as WithViolations).__violations ?? []),
  };
}

/** Opens the app and waits until it has finished loading, then marks the request baseline. */
export async function openApp(page: Page): Promise<Watch> {
  const watcher = await watch(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  watcher.mark();
  return watcher;
}

/** What the page has stored: all of these must stay empty. */
export function storageUsed(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    indexedDB: (await indexedDB.databases()).length,
    cacheStorage: (await caches.keys()).length,
  }));
}
