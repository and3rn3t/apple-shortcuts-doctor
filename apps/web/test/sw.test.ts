// @vitest-environment node
// Runs the real sw/sw.js source in a sandbox with a fake Cache API, and drives its events by hand.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://shortcuts.example.invalid';
const SOURCE = readFileSync(join(import.meta.dirname, '../sw/sw.js'), 'utf8');
const MARKER = /\/\* @build \*\/[\s\S]*?\/\* @end \*\//;

interface Build {
  cache: string;
  files: string[];
}
interface RequestLike {
  method: string;
  url: string;
  mode: string;
}
interface WorkerEvent {
  waitUntil?: (work: Promise<unknown>) => void;
  request?: RequestLike;
  respondWith?: (response: Promise<unknown>) => void;
}

const CURRENT: Build = {
  cache: 'shortcuts-doctor-aaaaaaaaaaaa',
  files: ['/', '/assets/app.js', '/icon.svg'],
};

function createWorker(build: Build = CURRENT, existing: string[] = []) {
  const listeners = new Map<string, ((event: WorkerEvent) => void)[]>();
  const stores = new Map<string, Map<string, string>>(existing.map(name => [name, new Map()]));
  const network: string[] = [];
  const calls = { skipWaiting: 0, claim: 0 };

  const cacheFor = (name: string) => ({
    // The real addAll fetches each request; the fake records that and stores a marker body.
    addAll: async (urls: string[]) => {
      const store = stores.get(name) ?? new Map<string, string>();
      stores.set(name, store);
      for (const url of urls) {
        network.push(url);
        store.set(url, `cached:${url}`);
      }
    },
    match: async (key: string) => stores.get(name)?.get(key),
  });

  const sandbox = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: (event: WorkerEvent) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
      skipWaiting: async () => void calls.skipWaiting++,
      clients: { claim: async () => void calls.claim++ },
    },
    caches: {
      open: async (name: string) => cacheFor(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    },
    fetch: async (request: RequestLike) => {
      network.push(request.url);
      return `network:${request.url}`;
    },
    URL,
    Set,
    Promise,
  };
  runInNewContext(SOURCE.replace(MARKER, JSON.stringify(build)), sandbox);

  async function lifecycle(type: 'install' | 'activate'): Promise<void> {
    const work: Promise<unknown>[] = [];
    for (const listener of listeners.get(type) ?? []) {
      listener({ waitUntil: promise => void work.push(promise) });
    }
    await Promise.all(work);
  }

  /** Dispatches a fetch event; returns the response the worker supplied, or undefined if it declined. */
  async function request(
    url: string,
    { method = 'GET', mode = 'no-cors' }: { method?: string; mode?: string } = {}
  ): Promise<unknown> {
    let response: Promise<unknown> | undefined;
    for (const listener of listeners.get('fetch') ?? []) {
      listener({
        request: {
          method,
          url: url.startsWith('http') || url.startsWith('blob:') ? url : ORIGIN + url,
          mode,
        },
        respondWith: promise => void (response = promise),
      });
    }
    return response ? await response : undefined;
  }

  return { stores, network, calls, lifecycle, request };
}

describe('service worker', () => {
  it('registers exactly the install, activate, and fetch handlers', () => {
    const names: string[] = [];
    const sandbox = {
      self: { location: { origin: ORIGIN }, addEventListener: (type: string) => names.push(type) },
      URL,
      Set,
    };
    runInNewContext(SOURCE, sandbox);
    expect(names.sort()).toEqual(['activate', 'fetch', 'install']);
  });

  describe('install', () => {
    it('precaches exactly the build’s files under the build’s cache name, then takes over', async () => {
      const worker = createWorker();
      await worker.lifecycle('install');
      expect([...worker.stores.keys()]).toEqual([CURRENT.cache]);
      expect([...(worker.stores.get(CURRENT.cache)?.keys() ?? [])]).toEqual(CURRENT.files);
      expect(worker.network).toEqual(CURRENT.files);
      expect(worker.calls.skipWaiting).toBe(1);
    });
  });

  describe('activate', () => {
    it('deletes every older cache, keeps the current one, and claims open pages', async () => {
      const worker = createWorker(CURRENT, [
        'shortcuts-doctor-oldoldoldold',
        CURRENT.cache,
        'some-other-cache',
      ]);
      await worker.lifecycle('activate');
      expect([...worker.stores.keys()]).toEqual([CURRENT.cache]);
      expect(worker.calls.claim).toBe(1);
    });
  });

  describe('fetch', () => {
    async function installed() {
      const worker = createWorker();
      await worker.lifecycle('install');
      worker.network.length = 0;
      return worker;
    }

    it('serves precached files from the cache without touching the network', async () => {
      const worker = await installed();
      expect(await worker.request('/assets/app.js')).toBe('cached:/assets/app.js');
      expect(await worker.request('/icon.svg')).toBe('cached:/icon.svg');
      expect(worker.network).toEqual([]);
    });

    it('answers every navigation with the cached app, whatever the route or query', async () => {
      const worker = await installed();
      for (const url of ['/', '/some/route', '/?utm=1', '/index.html']) {
        expect(await worker.request(url, { mode: 'navigate' }), url).toBe('cached:/');
      }
      expect(worker.network).toEqual([]);
    });

    it('matches a precached file by path, ignoring a query string', async () => {
      const worker = await installed();
      expect(await worker.request('/assets/app.js?v=2')).toBe('cached:/assets/app.js');
    });

    it('declines anything that is not precached, leaving it to the browser and never caching it', async () => {
      const worker = await installed();
      for (const url of [
        '/assets/other.js',
        '/data.json',
        '/private-export.json',
        '/manifest.webmanifest',
      ]) {
        expect(await worker.request(url), url).toBeUndefined();
      }
      expect(worker.network).toEqual([]);
      expect([...(worker.stores.get(CURRENT.cache)?.keys() ?? [])]).toEqual(CURRENT.files);
    });

    it('declines non-GET requests and other origins, even for a precached path', async () => {
      const worker = await installed();
      expect(await worker.request('/assets/app.js', { method: 'POST' })).toBeUndefined();
      expect(await worker.request('/', { method: 'PUT', mode: 'navigate' })).toBeUndefined();
      expect(await worker.request('https://evil.example.invalid/assets/app.js')).toBeUndefined();
      expect(
        await worker.request('http://shortcuts.example.invalid/assets/app.js')
      ).toBeUndefined();
    });

    it('declines blob: URLs, which is how downloads and previews are made', async () => {
      const worker = await installed();
      expect(
        await worker.request(`blob:${ORIGIN}/0f0f0f0f-0000-4000-8000-000000000000`)
      ).toBeUndefined();
    });

    it('falls back to the network for a precached file the cache no longer has', async () => {
      const worker = await installed();
      worker.stores.get(CURRENT.cache)?.delete('/icon.svg');
      expect(await worker.request('/icon.svg')).toBe(`network:${ORIGIN}/icon.svg`);
      // The fallback is served, not stored.
      expect(worker.stores.get(CURRENT.cache)?.has('/icon.svg')).toBe(false);
    });
  });
});
