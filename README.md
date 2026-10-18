# AI-Assisted Development Template

A comprehensive template repository pre-configured with AI coding assistant files for **VS Code Copilot**, **Cursor**, **Windsurf**, **Cline**, and **Claude Code**. Clone this repo to jumpstart any project with best-practice AI customizations.

## What's Included

### VS Code Copilot (`.github/`)

| Type | Path | Count | Purpose |
|------|------|-------|---------|
| **Workspace Instructions** | `.github/copilot-instructions.md` | 1 | Global project standards applied to every interaction |
| **File Instructions** | `.github/instructions/*.instructions.md` | 9 | Context-specific guidelines loaded on-demand or by file pattern |
| **Prompts** | `.github/prompts/*.prompt.md` | 11 | Reusable task templates invoked via `/` in chat |
| **Agents** | `.github/agents/*.agent.md` | 7 | Specialized AI personas with role-specific tools and constraints |
| **Skills** | `.github/skills/*/SKILL.md` | 3 | Multi-step workflows with bundled reference docs |
| **Hooks** | `.github/hooks/*.json` | 1 | Lifecycle automation for deterministic behavior enforcement |

### Cross-Tool AI Files (Root)

| File | Tool | Purpose |
|------|------|---------|
| `AGENTS.md` | Open standard | **Single source of truth** for all AI assistant instructions |
| `CLAUDE.md` | Claude Code | Pointer to AGENTS.md + Claude-specific notes |
| `.cursor/rules/project.mdc` | Cursor IDE | Pointer to AGENTS.md (modern format) |
| `.cursorrules` | Cursor IDE (legacy) | Pointer to AGENTS.md |
| `.clinerules` | Cline extension | Pointer to AGENTS.md |
| `.windsurfrules` | Windsurf IDE | Pointer to AGENTS.md |

> **Single-source pattern**: edit `AGENTS.md` only. The pointer files exist so every tool finds the instructions; they never carry their own copies of the content.

### Supporting Files

| File | Purpose |
|------|---------|
| `.editorconfig` | Cross-editor formatting consistency |
| `.gitignore` | Standard ignore patterns |
| `docs/AI-CUSTOMIZATION-GUIDE.md` | Comprehensive guide to all AI file types |
| `docs/README-template.md` | Standard README structure for new projects (copy into README.md) |
| `docs/ARCHITECTURE-template.md`, `docs/PRD-template.md`, `docs/ROADMAP-template.md` | Doc scaffolds (roadmap includes the AI pull-loop convention) |
| `docs/adr/0000-template.md` | Architecture Decision Record template |
| `profiles/web/` | Canonical eslint/prettier/tsconfig/wrangler configs for web repos |

### GitHub Platform & Community Files

| File | Purpose |
|------|---------|
| `LICENSE` | MIT license with placeholder for name and year |
| `CONTRIBUTING.md` | Contribution guide: setup, workflow, commit conventions |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 |
| `SECURITY.md` | Vulnerability reporting policy and response timeline |
| `CHANGELOG.md` | Keep a Changelog format with unreleased section |
| `.github/pull_request_template.md` | PR template with type-of-change checkboxes and checklist |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | YAML-based bug report issue form |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | YAML-based feature request issue form |
| `.github/ISSUE_TEMPLATE/config.yml` | Issue template config (blank issues, contact links) |
| `.github/workflows/ci.yml` | CI workflow with placeholder lint, test, and build jobs |
| `.github/dependabot.yml` | Automated dependency updates for Actions and npm |
| `.github/CODEOWNERS` | Code ownership patterns for automated review routing |
| `.github/workflows/release.yml` | Automated GitHub Releases on version tags |
| `.github/labels.yml` | Version-controlled issue/PR label definitions |
| `.github/workflows/label-sync.yml` | Syncs labels from `labels.yml` to your repo |

### Developer Experience

| File | Purpose |
|------|---------||
| `.devcontainer/devcontainer.json` | One-click dev environment for Codespaces and VS Code |
| `.vscode/extensions.json` | Recommended VS Code extensions for the project |
| `.vscode/settings.json` | Workspace editor settings (format-on-save, rulers, etc.) |
| `Makefile` | Self-documenting, language-agnostic task runner |
| `.env.example` | Documents required environment variables |

## Quick Start

1. **Clone or use as template**:

   ```bash
   git clone https://github.com/YOUR_ORG/ai-template-repo.git my-project
   cd my-project
   rm -rf .git && git init
   ```

2. **Choose your workspace instructions format** (pick ONE):
   - Keep `.github/copilot-instructions.md` (recommended for VS Code Copilot)
   - OR move `AGENTS.md` to root and delete `copilot-instructions.md`

3. **Customize for your project**:
   - Edit `.github/copilot-instructions.md` with your project's standards
   - Remove instructions/prompts/agents you don't need
   - Add instructions specific to your tech stack
   - Update cross-tool files (`.cursorrules`, etc.) to match

4. **Set up project metadata**:
   - Update `LICENSE` with your name and year (or [choose a different license](https://choosealicense.com))
   - Replace TODO placeholders in `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`
   - Customize `.github/workflows/ci.yml` with your build/test/lint commands
   - Edit `.github/dependabot.yml` for your package ecosystem
   - Configure `.github/CODEOWNERS` with your team's ownership patterns

5. **Set up your dev environment**:
   - Copy `.env.example` to `.env` and fill in your values
   - Update `Makefile` targets with your actual commands
   - Review `.vscode/settings.json` and `.vscode/extensions.json`
   - Try `make help` to see available task runner commands

6. **Remove cross-tool files you don't use**:
   - Only using Copilot? Remove `.cursorrules`, `.clinerules`, `.windsurfrules`, `CLAUDE.md`
   - Only using Cursor? Keep `.cursorrules`, remove others

## File Reference

### Instructions (`.github/instructions/`)

Auto-loaded when working on matching files, or discovered by the agent based on task relevance.

| File | Trigger | Purpose |
|------|---------|---------|
| `code-style.instructions.md` | `applyTo: **/*.{ts,js,py,...}` | Naming, formatting, organization |
| `testing.instructions.md` | `applyTo: **/*.{test,spec}.*` | Test patterns and conventions |
| `security.instructions.md` | `applyTo: **/auth/**, **/security/**` | Security best practices |
| `documentation.instructions.md` | `applyTo: **/*.md` | Documentation standards |
| `api-design.instructions.md` | `applyTo: **/api/**, **/routes/**` | REST API design patterns |
| `database.instructions.md` | `applyTo: **/migrations/**, **/models/**` | DB queries and migrations |
| `frontend.instructions.md` | `applyTo: **/*.{tsx,jsx,vue,svelte}` | UI components and state |
| `performance.instructions.md` | On-demand (description match) | Performance optimization |
| `git-conventions.instructions.md` | On-demand (description match) | Commit and branch conventions |

### Prompts (`.github/prompts/`)

Invoked with `/` in Copilot chat. Each is a focused task template.

| Prompt | Purpose |
|--------|---------|
| `/generate-tests` | Create comprehensive test suites |
| `/code-review` | Thorough code review with structured findings |
| `/refactor` | Improve code structure without changing behavior |
| `/generate-docs` | Create documentation for code |
| `/create-api-endpoint` | Scaffold a new API endpoint with tests |
| `/debug` | Systematic debugging workflow |
| `/create-component` | Build UI components with accessibility |
| `/generate-migration` | Create safe database migrations |
| `/explain-code` | Detailed code explanation |
| `/optimize` | Performance optimization with benchmarks |
| `/security-audit` | OWASP Top 10 security audit |

### Agents (`.github/agents/`)

Specialized personas available in the Copilot agent picker.

| Agent | Tools | Purpose |
|-------|-------|---------|
| `reviewer` | read, search | Code review specialist |
| `architect` | read, search | System design advisor |
| `tester` | read, search, edit, execute | Testing specialist |
| `security-auditor` | read, search | Security vulnerability finder |
| `docs-writer` | read, search, edit | Technical documentation writer |
| `explorer` | read, search | Read-only codebase analysis |
| `refactorer` | read, search, edit, execute | Code improvement specialist |

### Skills (`.github/skills/`)

Multi-step workflows invoked via `/` in chat, with bundled reference docs.

| Skill | Purpose | Bundled Resources |
|-------|---------|-------------------|
| `code-review` | Structured review workflow | Review checklist |
| `project-setup` | New project initialization | Project templates |
| `testing-workflow` | Comprehensive test creation | Testing patterns |

## Customization Tips

- **Keep instructions concise** — they share the AI's context window
- **Use `applyTo` sparingly** — broad patterns burn context on every request
- **Write keyword-rich descriptions** — this is how agents discover files
- **One concern per file** — separate testing, styling, and security into distinct files
- **Link, don't embed** — reference existing docs instead of copying content
- **Show, don't tell** — brief code examples beat lengthy explanations

See [docs/AI-CUSTOMIZATION-GUIDE.md](docs/AI-CUSTOMIZATION-GUIDE.md) for the complete reference.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
