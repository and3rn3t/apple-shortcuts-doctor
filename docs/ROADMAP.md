# Roadmap: Shortcuts Doctor

This is the canonical "what's next" list. AI agents and humans both pull work from here (see
[AGENTS.md](../AGENTS.md)).

**Guiding invariant for every item:** static only, never execute, never emit parameter values by
default, no network. An item that can't meet this is redesigned or dropped.

## In Progress / Up Next

> Keep this block small: at most 1–2 items in progress and 1–2 up next.

| Status         | Item                                    | Notes                         |
| -------------- | --------------------------------------- | ----------------------------- |
| 🟡 in progress | M1.3 `inspect` subcommand + `bin` entry | Skill keeps its argv contract |
| ⬜ up next     | M1.4 `--fail-on` exit codes; `--quiet`  | For CI use                    |

## Wave Sequence

### M1: CLI v0.2 (a usable tool)

| Status        | Item                                                                                        | Notes                                                |
| ------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| ✅ 2026-10-18 | M1.1 `--format text\|json\|md`; text is default for a TTY, JSON when piped/for the skill    | Renderers live in core so the web app reuses them    |
| ✅ 2026-10-18 | M1.2 Report schema v2 + published JSON Schema (`schema/report.v2.json`)                     | Keep v1 output available behind `--format-version 1` |
| ✅ 2026-10-18 | M1.3 `shortcuts-doctor inspect <file>` subcommand + `bin` entry                             | Skill script keeps its current argv contract         |
| 🟡            | M1.4 `--fail-on review\|warning` exit codes; `--quiet`                                      | For CI use on repos that version Shortcuts           |
| ⬜            | M1.5 Publish `shortcuts-doctor` to npm with provenance; enable `publish-npm` in release.yml | Needs `NPM_TOKEN` or trusted publishing              |

### M2: Web app v0.1 (client-side only)

| Status | Item                                                                                | Notes                                             |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| ⬜     | M2.1 Pure-TS plist parser in core (XML + `bplist00`), fuzz-tested                   | Also gives the CLI plist support on Linux/Windows |
| ⬜     | M2.2 Scaffold `apps/web`: React + TS + Vite, Workers static assets, wrangler config | Add `apps/*` to pnpm workspace                    |
| ⬜     | M2.3 Drag-and-drop inspector: walkthrough, grouped findings, dependency list        | **File never leaves the browser**                 |
| ⬜     | M2.4 Strict CSP (`connect-src 'none'`), no analytics, no third-party scripts        | Add a test that asserts the CSP header            |
| ⬜     | M2.5 "Download report (Markdown)" + offline PWA                                     | Reuses M1.1 renderer                              |

### M3: Deeper analysis

| Status | Item                                                                                                | Notes                                                  |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ⬜     | M3.1 Control-flow structure from `GroupingIdentifier` / `WFControlFlowMode` (if / menu / repeat)    | Nested walkthrough; flags unbalanced blocks            |
| ⬜     | M3.2 Named variables (`setvariable`/`getvariable`) and magic-variable tokens (`attachmentsByRange`) | Report variable _names_ only when user opts in         |
| ⬜     | M3.3 Implicit previous-action input edges                                                           | Labeled as inferred, distinct from explicit refs       |
| ⬜     | M3.4 Source→sink paths: "clipboard (#1) may reach Get Contents of URL (#4)"                         | Always phrased as _possible_                           |
| ⬜     | M3.5 Parameter _shape_: literal vs dynamic URL, HTTP method, has-body, header count                 | Never values. `--show-hosts` opt-in for hostnames only |
| ⬜     | M3.6 Hardcoded-secret heuristic (pattern + entropy), reported by action number only                 | Never echo the literal                                 |

### M4: Rule catalog and compatibility

| Status | Item                                                                                                                                         | Notes                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| ⬜     | M4.1 Expand rules: Health, HomeKit, Calendar/Reminders, Notes, Files save/append, Photos delete, Wi-Fi/network details, Focus, encode/decode | Data-driven catalog with per-rule tests |
| ⬜     | M4.2 Third-party App Intents (`com.vendor.App.*`) → "requires app X" dependency list                                                         | Bundle ID only, no lookup               |
| ⬜     | M4.3 Metadata checks: `WFWorkflowMinimumClientVersion`, `WFWorkflowTypes`, import questions, input classes                                   | OS/device compatibility findings        |
| ⬜     | M4.4 Deprecated/renamed action table → concrete repair suggestions                                                                           | Cite the evidence and uncertainty       |

### M5: Diff and review workflows

| Status | Item                                                                                                        | Notes                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ⬜     | M5.1 `shortcuts-doctor diff <old> <new>`: added/removed actions, **new** sensitive inputs/outbound channels | Reviewing an updated shared Shortcut; "it broke after I edited it" |
| ⬜     | M5.2 Mermaid data-flow graph (`--format mermaid`), rendered in the web app                                  | Depends on M3                                                      |
| ⬜     | M5.3 SARIF output                                                                                           | For GitHub code scanning on Shortcut repos                         |

### M6: Skill and quality hardening

| Status | Item                                                                                 | Notes                                        |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| ⬜     | M6.1 Skill eval suite: fixtures + expected report properties                         | Includes **prompt-injection fixtures**       |
| ⬜     | M6.2 SKILL.md compatible with both OpenClaw and Claude Agent Skills; ClawHub listing |                                              |
| ⬜     | M6.3 Property-based fuzzing of parsers (`fast-check`)                                |                                              |
| ⬜     | M6.4 Performance budget test: 2000 actions in under 200 ms                           |                                              |
| ⬜     | M6.5 Sanitized real-world fixture corpus                                             | Contributors redact with a documented script |

### Research spikes (no commitment)

| Status | Item                                                                                                    | Notes                                                     |
| ------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ⬜     | Read-only inspection of signed `.shortcut` (AEA) containers **with signature verified, never bypassed** | Must be reconciled with SKILL.md safety boundaries first  |
| ⬜     | Batch audit of an explicitly supplied folder                                                            | Never auto-discover the Shortcuts library or iCloud Drive |

## How To Pull Work

1. Check **In Progress / Up Next**. Finish 🟡 items before pulling new work.
2. Otherwise, pull the topmost ⬜ from the active wave.
3. Mark it 🟡 in the same commit as the first code change.
4. When it ships, mark it ✅ YYYY-MM-DD, promote the next ⬜, and update CHANGELOG.md in the same
   commit.

## Done

| Status        | Item                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ 2026-10-18 | M0 Foundation: TS core + CLI packages, generated skill bundle with drift check, lint/format/type/test gates, CI on Linux + macOS, docs |
| ✅ 2026-10-18 | M1.1 `--format text\|json\|md` with renderers in core (PR #9)                                                                          |
| ✅ 2026-10-18 | M1.2 Report `formatVersion: 2` + `schema/report.v2.json` (PR #11)                                                                      |
| ✅ 2026-10-18 | M1.3 `inspect` subcommand + `bin` entry (PR #12)                                                                                       |
