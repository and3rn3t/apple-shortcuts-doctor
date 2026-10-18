# Project Guidelines (AGENTS.md)

<!--
  SINGLE SOURCE OF TRUTH for AI assistant instructions.
  CLAUDE.md and .github/copilot-instructions.md are thin pointers to this file —
  edit HERE, not there. (Claude Code, Copilot, Cursor, and most agents all read
  AGENTS.md natively or via the pointer files.)

  AGENTS.md supports hierarchy in monorepos:
    /AGENTS.md              - Root defaults
    /apps/web/AGENTS.md     - App-specific (overrides root for that subtree)
-->

## Project Overview

<!-- Describe your project here: what it does, who it's for. -->

## Stack Defaults (and3rn3t projects)

Pick the profile that applies and delete the other.

### Web app (default)

- React + TypeScript + Vite; deployed to Cloudflare Workers via wrangler
- Package manager: **pnpm** (declare `packageManager` in package.json; do not mix with npm)
- Node: `>=24` (pinned in `.nvmrc`)
- Tests: **Vitest** (+ Testing Library for components); coverage via `vitest run --coverage`
- Lint/format: ESLint + Prettier

### Python CLI / skill

- pyproject.toml-based; stdlib-first, minimal dependencies
- If it doubles as a Claude/OpenClaw skill, keep `SKILL.md` frontmatter accurate (name, description, triggers, version)
- Tests: pytest in `tests/`

## Build Commands (web profile)

```bash
pnpm install
pnpm dev          # local dev server
pnpm cf:dev       # wrangler dev (Workers runtime)
pnpm test         # vitest
pnpm lint         # eslint
pnpm type-check   # tsc --noEmit
pnpm format       # prettier
pnpm build        # production build
```

## Deployment

- Cloudflare Workers via `wrangler deploy`; config lives in `wrangler.toml`/`wrangler.jsonc`
- Never deploy or commit unless explicitly asked
- Secrets via `wrangler secret` / environment variables — never hardcoded, never logged

## Code Style

- Write clean, readable code with meaningful names
- Follow language-idiomatic conventions
- Prefer composition over inheritance
- Keep functions focused and under 30 lines
- Use early returns to reduce nesting
- Handle errors explicitly — no silent catches

## Architecture

- Clear separation of concerns; business logic out of route handlers and UI components
- Dependency injection for testability
- Prefer explicit over implicit; no magic strings/numbers

## Testing

- All new code includes unit tests
- Follow Arrange-Act-Assert pattern
- Test behavior, not implementation
- Cover happy path, edge cases, and error cases

## Security

- Validate all user input at boundaries
- Parameterized queries for database operations
- Never log sensitive data
- Use environment variables for secrets

## Conventions

- Conventional commits: `type(scope): description` (enforced with commitlint where configured)
- Branch naming: `type/short-description`
- One logical change per pull request
- Update documentation when changing public APIs
