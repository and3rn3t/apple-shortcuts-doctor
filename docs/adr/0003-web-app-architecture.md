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
- **Deployed from CI on release tags** to `shortcuts.andernet.dev` (custom domain route in
  `apps/web/wrangler.jsonc`) with `wrangler deploy`. Nothing is deployed from a developer
  machine.

## Consequences

- Privacy is enforceable by construction: no backend, and a CSP that blocks outbound requests.
- Web and CLI share one engine, so findings can't drift between surfaces.
- No server-side features (sharing links, history). Anything needing storage would require a new
  ADR and would weaken the privacy claim.
- Dependencies are pinned exactly and the web build is part of `pnpm validate`.
