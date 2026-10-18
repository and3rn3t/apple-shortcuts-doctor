---
description: "Create a new REST API endpoint with validation, error handling, and tests"
agent: "agent"
argument-hint: "Describe the endpoint (e.g., 'POST /api/users to create a new user')"
---
Create a new API endpoint following the project's existing patterns.

## Steps
1. **Find** existing endpoint examples in the codebase to match patterns
2. **Create** the route handler with:
   - Input validation using the project's validation library
   - Proper HTTP status codes (201 for creation, 200 for success, etc.)
   - Consistent error response format
   - Authentication/authorization middleware if required
3. **Create** the service/business logic layer (don't put logic in the handler)
4. **Create** the data access layer if needed (repository pattern, ORM model)
5. **Write** tests covering:
   - Happy path with valid input
   - Validation errors (400)
   - Not found cases (404)
   - Authorization failures (401/403)
6. **Update** API documentation if a docs file exists

## Response Format
Use the project's existing response envelope. If none exists:
```json
{
  "data": {},
  "error": null,
  "meta": { "requestId": "..." }
}
```
