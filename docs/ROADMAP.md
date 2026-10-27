# Roadmap: Shortcuts Doctor

The roadmap and tech-debt backlog live in GitHub, not in this file:

- **Milestones** group the work by release: [all milestones](https://github.com/and3rn3t/apple-shortcuts-doctor/milestones)
- **Issues** are the work items: [open issues](https://github.com/and3rn3t/apple-shortcuts-doctor/issues)
- Filter by label: `tech-debt`, `feature`, `research`, and the area labels `core`, `cli`, `web`, `skill`
- Priority and size are labels too: `priority: high|medium|low`, `size: xs|s|m|l|xl`

| Milestone                     | Theme                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| v0.3: Works on real exports   | Plist on any OS, stdin, clear errors, less rule noise, accurate docs   |
| v0.4: Web app                 | Client-side only inspector on Workers static assets                    |
| v0.5: Deeper analysis         | Control flow, variables, inferred data flow, parameter shape, secrets  |
| v0.6: Rules and compatibility | Wider catalog, third-party intents, compatibility checks, repair hints |
| v0.7: Diff and CI workflows   | `diff` subcommand, Mermaid graph, SARIF                                |
| Quality and hardening         | Skill evals, fuzzing, performance budget, fixture corpus, repo hygiene |

## Guiding invariant for every item

Static only, never execute, never emit parameter values by default, no network. An item that
can't meet this is redesigned or dropped.

## How to pull work

1. Pick the highest-priority open issue in the earliest open milestone.
2. Open a PR that references it (`Closes #N`). Mark the issue `in-progress` if it spans days.
3. Update `CHANGELOG.md` (Unreleased) in the same PR.
4. New ideas and debt you find along the way become new issues, not edits to this file.

Shipped history lives in [CHANGELOG.md](../CHANGELOG.md).
