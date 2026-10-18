---
description: "Use when designing or implementing REST APIs, GraphQL schemas, API endpoints, route handlers, or service interfaces."
applyTo: ["**/api/**", "**/routes/**", "**/controllers/**", "**/resolvers/**"]
---
# API Design Guidelines

## REST Conventions

- Use nouns for resources, verbs come from HTTP methods
- Plural resource names: `/users`, `/orders`, `/products`
- Nest for relationships: `/users/:id/orders`
- Use query parameters for filtering, sorting, pagination
- Return appropriate HTTP status codes (201 for creation, 204 for no content, etc.)

## Request/Response

- Use consistent response envelope: `{ data, error, meta }`
- Include pagination metadata: `{ page, pageSize, total, totalPages }`
- Return meaningful error responses: `{ error: { code, message, details } }`
- Use ISO 8601 for dates, UTC timezone
- Support partial responses where appropriate (field selection)

## Versioning

- Version APIs in the URL path: `/api/v1/resource`
- Maintain backward compatibility within a major version
- Deprecate endpoints before removal with clear timelines

## Validation

- Validate request bodies against a schema (Zod, Joi, Pydantic, etc.)
- Return 400 for validation errors with specific field-level messages
- Validate path and query parameters
- Set sensible defaults for optional parameters

## Performance

- Implement pagination for list endpoints (default page size: 20, max: 100)
- Use cursor-based pagination for large or real-time data sets
- Support `ETag`/`If-None-Match` for caching
- Consider rate limiting on expensive operations
