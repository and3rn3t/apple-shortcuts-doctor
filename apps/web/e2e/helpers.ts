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
  // On the context, so requests made by the service worker are seen as well as the page's own.
  page.context().on('request', request => requests.push(request.url()));
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

/** Waits until the offline worker is active and controlling the page (it precaches on install). */
export async function waitForOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        })
      );
    }
  });
}

/**
 * Opens the app, waits until it has loaded and its offline worker has finished precaching, then
 * marks the request baseline: anything after this is something the app chose to do.
 */
export async function openApp(page: Page): Promise<Watch> {
  const watcher = await watch(page);
  await page.goto('/');
  await waitForOfflineReady(page);
  await page.waitForLoadState('networkidle');
  watcher.mark();
  return watcher;
}

export interface StorageUsed {
  localStorage: number;
  sessionStorage: number;
  indexedDB: number;
  /** Paths of every cached response, sorted. Only the offline worker's precache may be here. */
  cachedPaths: string[];
}

/** What the page has stored. Everything but the worker's precache must stay empty. */
export function storageUsed(page: Page): Promise<StorageUsed> {
  return page.evaluate(async () => {
    const cachedPaths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        cachedPaths.push(new URL(request.url).pathname);
      }
    }
    return {
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
      indexedDB: (await indexedDB.databases()).length,
      cachedPaths: cachedPaths.sort(),
    };
  });
}
