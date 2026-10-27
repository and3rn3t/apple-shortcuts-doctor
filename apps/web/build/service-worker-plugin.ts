import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/** Served by the platform, or the worker itself: never part of the precache. */
const NOT_PRECACHED = new Set(['_headers', 'sw.js']);
const BUILD_MARKER = /\/\* @build \*\/[\s\S]*?\/\* @end \*\//;
const TEMPLATE = fileURLToPath(new URL('../sw/sw.js', import.meta.url));

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/**
 * Writes dist/sw.js: sw/sw.js with this build's file list and a cache name derived from the
 * content of every file, so any change to the build produces a new cache and a new worker.
 */
export function serviceWorker(): Plugin {
  let outDirectory = '';
  return {
    name: 'shortcuts-doctor:service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDirectory = join(config.root, config.build.outDir);
    },
    // After every other hook, so the public files have been copied into the output directory.
    closeBundle() {
      const names = listFiles(outDirectory)
        .map(path => relative(outDirectory, path).split(sep).join('/'))
        .filter(name => !NOT_PRECACHED.has(name))
        .sort();
      const template = readFileSync(TEMPLATE, 'utf8');
      if (!BUILD_MARKER.test(template)) throw new Error('sw/sw.js has no @build marker.');
      const hash = createHash('sha256').update(template);
      for (const name of names) hash.update(name).update(readFileSync(join(outDirectory, name)));
      const build = {
        cache: `shortcuts-doctor-${hash.digest('hex').slice(0, 12)}`,
        // "/" is index.html: the platform serves it there, and redirects /index.html to it.
        files: ['/', ...names.filter(name => name !== 'index.html').map(name => `/${name}`)],
      };
      const body = `/* @build */ ${JSON.stringify(build)} /* @end */`;
      writeFileSync(join(outDirectory, 'sw.js'), template.replace(BUILD_MARKER, body));
    },
  };
}
