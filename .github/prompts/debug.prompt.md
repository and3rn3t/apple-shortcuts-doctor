---
description: "Debug an issue by analyzing code, identifying root cause, and implementing a fix"
agent: "agent"
argument-hint: "Describe the bug, error message, or unexpected behavior"
---
Debug the described issue systematically.

## Approach
1. **Reproduce**: Understand the expected vs actual behavior
2. **Isolate**: Narrow down the affected code path
   - Check error messages and stack traces
   - Search for related code using function names and error strings
   - Look at recent changes that could have introduced the bug
3. **Root Cause**: Identify the underlying cause (not just symptoms)
   - Check data flow: what inputs lead to this path?
   - Check state: is shared state being mutated unexpectedly?
   - Check timing: is this a race condition?
   - Check boundaries: is input validation missing?
4. **Fix**: Implement the minimal change that addresses the root cause
5. **Test**: Add a test that reproduces the bug and verifies the fix
6. **Verify**: Check for similar patterns elsewhere that might have the same bug

## Output
- Root cause explanation
- The fix with clear reasoning
- Test that prevents regression
- Any related areas that might need attention
