# Web profile — canonical configs

Copy these into a new React+TS+Vite+Cloudflare repo, then adjust:

- `.prettierrc` — drop the tailwind plugin if not using Tailwind
- `eslint.config.js` — flat config; requires eslint 9+, typescript-eslint 8+
- `tsconfig.json` — bundler resolution, strict, `@/*` path alias
- `wrangler.toml` — set project name; secrets via `wrangler secret put`
