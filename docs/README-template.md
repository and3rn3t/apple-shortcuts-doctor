# Project Name

> One-line pitch: what it is and who it's for. (Replace this file's contents into README.md when starting a repo.)

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/and3rn3t/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/and3rn3t/REPO/actions/workflows/ci.yml)
<!-- Optional extras once earned: version, coverage, Lighthouse, platform badges.
[![Version](https://img.shields.io/github/v/release/and3rn3t/REPO?label=version)](https://github.com/and3rn3t/REPO/releases)
[![codecov](https://codecov.io/gh/and3rn3t/REPO/graph/badge.svg)](https://codecov.io/gh/and3rn3t/REPO)
-->

🚀 **Live**: [repo.andernet.dev](https://repo.andernet.dev) <!-- delete if not deployed -->

## Features

- **Feature one** — what it does and why it matters
- **Feature two** — lead with the bolded capability, follow with the payoff
- **Feature three** — 4–8 bullets total; move detail to docs/

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| Testing | Vitest (+ Playwright e2e) |
| Deploy | Cloudflare Workers/Pages via wrangler |

<!-- Python variant:
| Layer | Technology |
|-------|-----------|
| Language | Python >=3.10 (pyproject.toml) |
| CLI | entry points in pyproject `[project.scripts]` |
| Testing | pytest |
-->

## Quick Start

**Prerequisites**: Node 24 (`nvm use`), pnpm 10

```bash
pnpm install
pnpm dev          # local dev server
pnpm cf:dev       # full stack under wrangler (if applicable)
```

<!-- Python variant:
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```
-->

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm test` | Run tests (Vitest) |
| `pnpm lint` | ESLint |
| `pnpm type-check` | `tsc --noEmit` |
| `pnpm build` | Production build |
| `pnpm validate` | lint + type-check + test — the done-gate |

## Testing

```bash
pnpm test              # unit
pnpm test:e2e          # Playwright (if configured)
```

## Deployment

Cloudflare via `wrangler deploy` / `wrangler pages deploy` — see `wrangler.toml`. Secrets via `wrangler secret put`; never committed.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design <!-- create for non-trivial projects -->
- [AGENTS.md](AGENTS.md) — conventions for AI assistants and humans
- [CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [CHANGELOG.md](CHANGELOG.md)

## License

MIT © Matthew Anderson — see [LICENSE](LICENSE).

<!--
README conventions (delete this comment):
- Order is fixed: pitch → badges → live link → Features → Tech Stack → Quick Start → Scripts → Testing → Deployment → Documentation → License.
- Keep it under ~200 lines; deep content goes in docs/ or ARCHITECTURE.md.
- Only add badges that are real (working CI, actual coverage) — no aspirational badges.
- Update Features when shipping something user-visible; README drift is a bug.
-->
