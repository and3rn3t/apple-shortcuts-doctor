---
description: "Use when writing database queries, migrations, schema changes, ORM models, data access layers, or working with SQL/NoSQL databases."
applyTo: ["**/migrations/**", "**/models/**", "**/schema/**", "**/database/**", "**/db/**"]
---
# Database Guidelines

## Migrations

- Always create reversible migrations with both up and down
- One logical change per migration file
- Never modify existing migrations that have been deployed
- Test rollback before merging
- Never drop columns in the same release as code removal — use a multi-step deprecation

## Schema Design

- Use meaningful table and column names (avoid abbreviations)
- Add appropriate indexes for query patterns; avoid over-indexing
- Use foreign keys to enforce referential integrity
- Include `created_at` and `updated_at` timestamps on all tables
- Use UUIDs or ULIDs for public-facing IDs; auto-increment for internal use

## Queries

- Always use parameterized queries — never string interpolation
- Select only needed columns; avoid `SELECT *` in production code
- Use transactions for multi-step operations that must be atomic
- Add appropriate `WHERE` clauses to `UPDATE` and `DELETE` statements
- Profile and optimize slow queries; add `EXPLAIN` analysis for complex joins

## ORM Best Practices

- Define relationships explicitly in models
- Use eager loading to avoid N+1 queries
- Validate data at the model layer before database operations
- Use database-level constraints as a safety net (NOT NULL, UNIQUE, CHECK)
