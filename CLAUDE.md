# CLAUDE.md — Claude Code Project Instructions

**Read `AGENTS.md` first — it is the single source of truth for stack, build commands, style, testing, and conventions.** This file only holds Claude-specific additions; don't duplicate AGENTS.md content here.

## Claude-specific notes

- Don't commit, push, or deploy unless explicitly asked.
- Prefer `pnpm` commands exactly as listed in AGENTS.md; don't substitute npm.
- When a Cloudflare MCP connector is available (Cowork sessions), prefer it for inspecting Workers/KV/R2/D1 over guessing from config files.
- Run `pnpm lint && pnpm type-check && pnpm test` before declaring a change done.

## Project Overview

<!-- Describe your project here, or leave to AGENTS.md -->
