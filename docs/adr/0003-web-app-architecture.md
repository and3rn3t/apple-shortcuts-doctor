# ADR-0003: Web app as Workers static assets, client-side only

- **Status**: accepted
- **Date**: 2026-10-27

## Context

Milestone v0.4 adds a web surface where people can check a Shortcut without installing the CLI.
Exports can contain URLs, headers and personal data, so the file must never leave the browser.
ADR-0002 made core decode plists in pure TypeScript, which removed the last blocker for running
the whole engine client-side.

## Decision

- **Static assets only.** `apps/web` is a Vite + React build served by Cloudflare Workers static
  assets (`assets.directory = ./dist`, single-page-application fallback). There is no Worker
  script (`main` is unset), so there is no server code that could receive a file.
- **Core consumed as source.** The app depends on `@shortcuts-doctor/core` as `workspace:*`; its
  `exports` points at `src/index.ts` and Vite compiles it with the app, as with the CLI bundle.
  Core stays browser-safe (ESLint rejects `node:*` imports in core and in `apps/web/src`).
- **No network after page load.** The app makes no fetches, loads no external fonts or scripts,
  and ships local CSS only. The flow is `File` → `arrayBuffer` → `parseExport` →
  `inspectWorkflow`, entirely in the page.
- **Response headers from `public/_headers`.** A strict Content-Security-Policy (including
  `connect-src 'none'`) and related headers are served from Vite's `public/_headers` file, so the
  policy ships with the assets. `scripts/check-web-build.mjs` runs after every web build and
  fails on a CSP that allows anything beyond `'none'`, `'self'`, and `data:` (or repeats a
  directive, since browsers enforce the first copy), on any `! header` rule that detaches the CSP
  or another required header, and on any network API, inline script, or external resource in the
  built files. Detaching the CSP for one path will need an explicit exception in the script. The Vite module-preload polyfill
  is off because it calls `fetch()`. Every matching `_headers` rule applies (checked with `wrangler
dev`), so a path that matches two rules gets two Content-Security-Policy headers and browsers
  enforce both; a more specific rule can't relax this policy. Relaxing it for one path (a service
  worker, in #37) means detaching the header first with `! Content-Security-Policy` and then
  setting the replacement, which also keeps the other headers.
- **Works offline through a small, hand-written service worker** (`apps/web/sw/sw.js`).
  - The build (`build/service-worker-plugin.ts`) fills in a cache name derived from the content of
    every file and the list of the build's files, and writes `dist/sw.js`. The worker precaches
    that list on install, serves exactly those files cache-first, answers every navigation with
    the cached app, and on activation deletes every older cache.
  - It **never caches anything else**: no runtime caching, and it declines every request that is
    not a same-origin GET for a precached path (including `blob:` downloads). Exports are read in
    the page and never requested, so they never pass through it.
  - _Why not `vite-plugin-pwa`:_ the worker is about 40 lines, and a generator would add a
    dependency (and Workbox's runtime-caching machinery) to code whose whole value is that it does
    almost nothing. The unit tests run the real source in a sandbox with a fake Cache API.
  - _CSP:_ the worker has to `fetch` its own files, so `/sw.js` is the one path that detaches the
    page policy and sets `default-src 'none'; connect-src 'self'`. `scripts/check-web-build.mjs`
    allows that single exception, requires the rule to detach (a stacked policy would leave both
    enforced), and requires the precache list to match `dist` exactly. `fetch` is allowed in
    `sw.js` and nowhere else.
- **Deployed from CI on release tags** to `shortcuts.andernet.dev` (custom domain route in
  `apps/web/wrangler.jsonc`) with `wrangler deploy`. Nothing is deployed from a developer
  machine.

## Consequences

- Privacy is enforceable by construction: no backend, and a CSP that blocks outbound requests.
- Web and CLI share one engine, so findings can't drift between surfaces.
- No server-side features (sharing links, history). Anything needing storage would require a new
  ADR and would weaken the privacy claim.
- Dependencies are pinned exactly and the web build is part of `pnpm validate`.
- The privacy and accessibility claims are tested in a real browser (`apps/web/e2e`, the `web-e2e`
  CI job), against `wrangler dev` so the shipped `_headers` apply, rather than only in jsdom.
