---
description: "Generate documentation for code including README sections, API docs, and inline documentation"
agent: "agent"
argument-hint: "Describe what needs documentation"
---
Generate clear, accurate documentation for the provided code.

## What to Document
1. **Purpose**: What the code does and why it exists
2. **Usage**: How to use it with practical examples
3. **Parameters**: Types, descriptions, defaults, and constraints
4. **Return values**: What's returned and in what format
5. **Errors**: What can go wrong and how to handle it
6. **Examples**: Working code samples for common use cases

## Format Guidelines
- Use the documentation style already present in the codebase
- For functions/methods: JSDoc, docstrings, or XML docs as appropriate
- For modules/packages: README.md with setup, usage, and API reference
- Include code examples that can be copy-pasted and run
- Keep language clear and concise — avoid jargon

## Quality Checks
- All parameters and return types documented
- Examples actually work (no pseudo-code)
- Edge cases and limitations noted
- Links to related documentation where helpful
