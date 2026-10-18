# AI Customization Guide

A comprehensive reference for configuring AI coding assistants in your project. This guide covers all customization primitives available in VS Code Copilot and compatible tools.

## Table of Contents

- [Overview](#overview)
- [Decision Flow](#decision-flow)
- [Workspace Instructions](#workspace-instructions)
- [File Instructions](#file-instructions)
- [Prompts](#prompts)
- [Custom Agents](#custom-agents)
- [Skills](#skills)
- [Hooks](#hooks)
- [Cross-Tool Files](#cross-tool-files)
- [Best Practices](#best-practices)
- [Common Pitfalls](#common-pitfalls)

---

## Overview

AI customization files tell coding assistants how to work with your specific project. Instead of generic responses, the AI follows your team's conventions, uses your patterns, and understands your architecture.

| Primitive | Purpose | Behavior |
|-----------|---------|----------|
| Workspace Instructions | Always-on project standards | Included in every request |
| File Instructions | Context-specific guidelines | Loaded by file pattern or task relevance |
| Prompts | Reusable task templates | Manually invoked via `/` |
| Custom Agents | Specialized personas | Selected in agent picker or delegated to |
| Skills | Multi-step workflows | Invoked via `/` with bundled resources |
| Hooks | Lifecycle automation | Deterministic enforcement at events |

## Decision Flow

Use this guide to choose the right customization type:

```
Does this apply to ALL work in the project?
  YES → Workspace Instructions (.github/copilot-instructions.md)
  NO  ↓

Does it apply when working on specific FILE TYPES?
  YES → File Instructions with applyTo (.github/instructions/)
  NO  ↓

Is it a specific TASK that's triggered manually?
  Single step → Prompt (.github/prompts/)
  Multi-step with bundled resources → Skill (.github/skills/)

Does it need a specialized PERSONA with restricted tools?
  YES → Custom Agent (.github/agents/)

Does it need DETERMINISTIC enforcement (not just guidance)?
  YES → Hook (.github/hooks/)
```

---

## Workspace Instructions

**File**: `.github/copilot-instructions.md` or root `AGENTS.md`

Automatically included in every Copilot interaction. Use for project-wide standards that apply to all work.

### When to Use
- Coding standards that apply everywhere
- Team conventions shared through version control
- Project-wide requirements (testing, documentation)

### Template
```markdown
# Project Guidelines

## Code Style
{Language and formatting preferences}

## Architecture
{Major components and structural decisions}

## Build and Test
{Commands to install, build, test}

## Conventions
{Patterns that differ from common practices}
```

### Tips
- Keep it concise — every line is included in every request
- Link to detailed docs instead of embedding them
- Only include what's relevant to *every* task
- Update when practices change

### AGENTS.md Alternative
For monorepos, `AGENTS.md` supports hierarchical overrides:
```
/AGENTS.md              # Root defaults
/frontend/AGENTS.md     # Frontend-specific (overrides root)
/backend/AGENTS.md      # Backend-specific (overrides root)
```

**Important**: Use `copilot-instructions.md` OR `AGENTS.md` — never both.

---

## File Instructions

**Location**: `.github/instructions/*.instructions.md`

Guidelines loaded on-demand when relevant to the current task, or explicitly when files match a glob pattern.

### Frontmatter
```yaml
---
description: "Use when writing database migrations or schema changes"
applyTo: "**/migrations/**"     # Optional: auto-attach for matching files
---
```

### Discovery Modes

| Mode | How It Works | Best For |
|------|-------------|----------|
| **On-demand** | Agent reads `description` and loads when relevant | Task-based: migrations, refactoring |
| **Explicit** | Files matching `applyTo` glob | File-based: language standards |
| **Manual** | User attaches via "Add Context" | Ad-hoc usage |

### `applyTo` Patterns
```yaml
applyTo: "**/*.py"                      # All Python files
applyTo: ["src/**", "lib/**"]           # Multiple patterns (OR)
applyTo: "src/api/**/*.ts"              # Specific folder + extension
applyTo: "**"                           # ALWAYS included (use with caution!)
```

### Tips
- One concern per file (don't mix testing + security + styling)
- Use "Use when..." pattern in descriptions for better discovery
- Keep focused — instructions share the AI's context window
- Use `applyTo: "**"` very sparingly — it loads on every file interaction

---

## Prompts

**Location**: `.github/prompts/*.prompt.md`

Reusable task templates invoked via `/` in Copilot chat.

### Frontmatter
```yaml
---
description: "Generate test cases for selected code"
agent: "agent"                    # Optional: ask, agent, plan, or custom agent name
model: "Claude Sonnet 4"         # Optional: specific model
tools: [search, edit]             # Optional: tool restrictions
argument-hint: "Describe the code to test"  # Optional: input hint
---
```

### Invocation
1. Type `/` in Copilot chat
2. Select the prompt from the list
3. Provide any arguments described in `argument-hint`

### Tips
- One prompt = one well-defined task
- Include output format examples when structure matters
- Reference instruction files instead of duplicating content
- Use `agent: "agent"` for tasks that need file access

---

## Custom Agents

**Location**: `.github/agents/*.agent.md`

Specialized personas with specific tools, instructions, and constraints.

### Frontmatter
```yaml
---
description: "Use when reviewing code for quality and security issues"
tools: [read, search]           # Restrict to minimal needed tools
user-invocable: true            # Show in agent picker (default: true)
---
```

### Tool Aliases
| Alias | Capability |
|-------|-----------|
| `read` | Read file contents |
| `edit` | Edit files |
| `search` | Search files or text |
| `execute` | Run terminal commands |
| `web` | Web search and URL fetching |
| `agent` | Invoke other agents as subagents |
| `todo` | Manage task lists |

### Agent Body Structure
```markdown
You are a [role]. Your job is to [purpose].

## Constraints
- DO NOT [thing this agent should never do]
- ONLY [the one thing this agent does]

## Approach
1. [Step one]
2. [Step two]

## Output Format
[What this agent returns]
```

### Tips
- One role per agent — avoid "swiss army" agents
- Minimal tools — only what the role needs
- Clear boundaries — define what the agent should NOT do
- Keyword-rich descriptions for subagent discovery

---

## Skills

**Location**: `.github/skills/<skill-name>/SKILL.md`

Multi-step workflows with bundled reference documents, scripts, and templates.

### Structure
```
.github/skills/<skill-name>/
├── SKILL.md           # Required entry point (name must match folder)
├── references/        # Supporting documentation
├── scripts/           # Executable scripts
└── assets/            # Templates and boilerplate
```

### Frontmatter
```yaml
---
name: skill-name          # Must match folder name exactly
description: 'Brief description with trigger keywords'
---
```

### Progressive Loading
1. **Discovery**: Agent reads `name` and `description` (~100 tokens)
2. **Instructions**: Loads `SKILL.md` body when relevant (<5000 tokens)
3. **Resources**: Additional files load only when referenced

### Tips
- Keep `SKILL.md` under 500 lines; use reference files for details
- Folder name must match the `name` field exactly
- Use relative paths (`./references/checklist.md`) for bundled files
- Include "When to Use" section with specific trigger scenarios

---

## Hooks

**Location**: `.github/hooks/*.json`

Deterministic automation at agent lifecycle events. Unlike instructions (which guide behavior), hooks *enforce* behavior via shell commands.

### Events
| Event | Trigger |
|-------|---------|
| `SessionStart` | New agent session begins |
| `UserPromptSubmit` | User sends a prompt |
| `PreToolUse` | Before any tool invocation |
| `PostToolUse` | After successful tool invocation |
| `Stop` | Agent session ends |

### Example: Inject Context After Edits
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "echo '{\"systemMessage\": \"Run tests after changes.\"}'",
        "timeout": 10
      }
    ]
  }
}
```

### When to Use Hooks vs Instructions
- **Instructions**: Guidance the AI *should* follow (non-deterministic)
- **Hooks**: Rules that *must* be enforced (deterministic, shell commands)

---

## Cross-Tool Files

Keep AI context consistent across different tools by maintaining parallel files:

| File | Tool | Format |
|------|------|--------|
| `.github/copilot-instructions.md` | VS Code Copilot | Markdown |
| `AGENTS.md` | Open standard | Markdown |
| `CLAUDE.md` | Claude Code | Markdown |
| `.cursorrules` | Cursor IDE | Plain text / Markdown |
| `.clinerules` | Cline extension | Plain text / Markdown |
| `.windsurfrules` | Windsurf IDE | Plain text / Markdown |

**Pattern**: `AGENTS.md` is the **single source of truth**. All other cross-tool files (`CLAUDE.md`, `.github/copilot-instructions.md`, `.cursorrules`, `.clinerules`, `.windsurfrules`, `.cursor/rules/project.mdc`) are thin pointers to it. Edit AGENTS.md; never duplicate content into the pointer files — duplication is how drift happens. Tool-specific additions (e.g. Claude-only notes) go in that tool's pointer file below the pointer.

---

## Best Practices

1. **Start minimal, add as needed**
   - Begin with `copilot-instructions.md` and a few key instructions
   - Add prompts and agents as you identify repeated tasks
   - Don't create everything upfront

2. **Keep instructions concise**
   - Every instruction competes for context window space
   - One focused concern per file
   - Link to detailed docs instead of embedding

3. **Write great descriptions**
   - Descriptions are the discovery surface — agents find files by reading them
   - Use "Use when..." pattern with specific trigger keywords
   - Include the vocabulary your team uses when discussing the topic

4. **Test your customizations**
   - Try invoking prompts and agents to verify they work
   - Check that `applyTo` patterns match the intended files
   - Verify descriptions enable on-demand discovery

5. **Version control everything**
   - Commit all `.github/` customizations to share with the team
   - Review changes to AI files like any other code change
   - AGENTS.md is the single source of truth; pointer files never carry duplicated content

---

## Common Pitfalls

| Pitfall | Problem | Fix |
|---------|---------|-----|
| `applyTo: "**"` everywhere | Burns context on every interaction | Use specific globs |
| Vague descriptions | Agent can't discover the file | Use "Use when..." with keywords |
| Both `copilot-instructions.md` and `AGENTS.md` | Conflicting instructions | Pick one format |
| Kitchen-sink workspace instructions | Drowns out important guidance | Keep minimal, link to docs |
| Name mismatch in skills | Skill silently fails to load | Folder name must match `name` field |
| Swiss-army agents | Too many tools, unfocused | One role, minimal tools |
| Mixing concerns in instructions | Hard to maintain, wastes context | One file per concern |
| YAML frontmatter errors | Silent failures | Quote descriptions with colons, use spaces not tabs |
