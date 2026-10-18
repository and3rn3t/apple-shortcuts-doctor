---
description: "Refactor code to improve readability, maintainability, and design without changing behavior"
agent: "agent"
argument-hint: "Describe what to refactor and the goal"
---
Refactor the provided code while preserving its exact external behavior.

## Process
1. **Understand** the current behavior by reading the code and its tests
2. **Identify** code smells: long functions, deep nesting, duplication, unclear naming
3. **Plan** refactoring steps — each should be a small, safe transformation
4. **Apply** refactoring patterns:
   - Extract method/function for repeated or complex logic
   - Rename for clarity
   - Replace conditionals with polymorphism or strategy pattern where appropriate
   - Simplify with early returns
   - Remove dead code
5. **Verify** that existing tests still pass; update tests if signatures changed
6. **Explain** what changed and why in a brief summary

## Constraints
- Do NOT change external behavior or API contracts
- Do NOT add new features during refactoring
- Keep each change small enough to review independently
- If tests don't exist, create them BEFORE refactoring
