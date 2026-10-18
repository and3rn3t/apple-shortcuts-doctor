---
name: project-setup
description: "Set up a new project with proper structure, configuration, and tooling. Use when initializing new projects, adding CI/CD, configuring linters, or setting up development environments."
argument-hint: "Describe the project type and tech stack"
---
# Project Setup Workflow

## When to Use
- Initializing a new project from scratch
- Adding development tooling (linters, formatters, pre-commit hooks)
- Setting up CI/CD pipelines
- Configuring development environments
- Adding AI customization files to an existing project

## Procedure
1. Determine the project type and tech stack
2. Reference the [project templates](./references/templates.md) for common setups
3. Initialize the project structure with appropriate directories
4. Configure essential tooling:
   - Package manager and dependency management
   - Linter and formatter (ESLint, Prettier, Black, etc.)
   - Testing framework
   - Git hooks (husky, pre-commit)
   - EditorConfig for cross-editor consistency
5. Set up AI customization files:
   - `.github/copilot-instructions.md` with project-specific guidelines
   - Relevant `.instructions.md` files for the tech stack
   - Useful `.prompt.md` files for common tasks
6. Create documentation:
   - README with setup and usage instructions
   - CONTRIBUTING.md with development workflow
7. Verify the setup by running build, lint, and test commands

## Output
- Complete project structure with all configuration files
- Working build and test commands
- AI customization files tailored to the project
- Documentation for getting started
