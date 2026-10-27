### Added

- The web app ships a strict Content-Security-Policy and related headers in `apps/web/public/_headers`
  (`default-src 'none'`, `connect-src 'none'`, no inline scripts or styles, no framing), so the page
  can open no connection. `pnpm validate` now also runs `scripts/check-web-build.mjs`, which fails
  the build on any network API, inline or external resource, or CSP that allows more than
  `'none'`, `'self'`, and `data:` (#36).
