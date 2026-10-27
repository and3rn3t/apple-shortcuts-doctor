# @shortcuts-doctor/web

The browser surface of Shortcuts Doctor: choose a Shortcut export and read the same static report
as the CLI, with **the file never leaving your device**. Served from
`shortcuts.andernet.dev` as Cloudflare Workers static assets: there is no server code to send a
file to.

## Why the file stays in the browser

- The page reads the file with `File.arrayBuffer()` and runs `@shortcuts-doctor/core`, the same
  engine as the CLI, in your tab. Nothing is executed, imported or signed.
- The Content-Security-Policy in [`public/_headers`](public/_headers) is
  `default-src 'none'` with `connect-src 'none'`: the page can load only its own script and
  stylesheet and can open no connection of any kind, not even by mistake.
- `scripts/check-web-build.mjs` fails the build if the output contains a network, storage or
  `eval` API, an inline or external resource, or a weaker policy. It runs in `pnpm validate` and
  before every deploy.
- Playwright tests (`e2e/`) run the built app under the real headers and require zero requests
  after load, nothing written to storage, and no accessibility violations.
- After a release deploy, `scripts/verify-deployed.mjs` checks that the live site serves the
  built files byte-for-byte with those headers.

The one exception is `/sw.js`, which may connect to the site's own origin so it can precache the
build for offline use. It caches only the files listed at build time, never your export.

## Develop

From the repository root:

```bash
pnpm --filter @shortcuts-doctor/web dev      # Vite dev server
pnpm --filter @shortcuts-doctor/web build    # production build into apps/web/dist
pnpm --filter @shortcuts-doctor/web exec playwright install chromium   # once
pnpm test:e2e                                # build, then Playwright against `wrangler dev`
```

`wrangler dev` serves `dist/` with `_headers` applied, so the e2e tests see the production policy.
Deployment is part of the tagged release; see [CONTRIBUTING.md](../../CONTRIBUTING.md#deploying-the-web-app)
and [ADR-0003](../../docs/adr/0003-web-app-architecture.md).
