---
description: "Generate a database migration for schema changes with up/down scripts"
agent: "agent"
argument-hint: "Describe the schema change (e.g., 'Add email_verified column to users table')"
---
Generate a database migration for the described schema change.

## Steps
1. **Find** the project's migration framework and existing migration files
2. **Create** the migration with:
   - Descriptive filename following the project's naming convention
   - `up` migration applying the change
   - `down` migration reversing the change exactly
3. **Include** safety considerations:
   - Add columns as nullable first if adding NOT NULL to existing tables
   - Create indexes concurrently (if supported) for large tables
   - Use transactions where appropriate
   - Consider data backfill needs
4. **Add** appropriate constraints:
   - NOT NULL, UNIQUE, CHECK constraints
   - Foreign keys with appropriate ON DELETE behavior
   - Default values where sensible
5. **Document** any data migration steps needed alongside the schema change

## Safety Checks
- This migration safe to run on a live database?
- Can it be rolled back without data loss?
- Will it lock tables for an unacceptable duration?
- Are there dependent migrations that need to run first?
