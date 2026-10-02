---
name: backend-api
description: >-
  Use when building backend APIs and services. Handles server setup,
  route implementation, database integration, and API testing.
---

# Backend API Skill

## Steps

1. **Verify environment** — runtime (Node.js/Python/Java), package manager, database.
2. **Initialize project** — server framework, project structure, middleware.
3. **Implement routes** — following architecture.json API contracts.
4. **Database layer** — ORM/query builder, migrations (always reversible).
5. **Authentication** — implement per requirements (Firebase Auth, JWT, etc.).
6. **Validation** — input validation on all endpoints.
7. **Error handling** — consistent error response format.
8. **Testing** — unit tests for handlers, integration tests for routes.
9. **Health check** — `/health` endpoint for Gate 4 verification.

## Output
- API implementation
- Tests + results
- Health check endpoint
- API documentation

## Never
- Accept unvalidated input.
- Return stack traces in production errors.
- Use open CORS (`*`) in production.
- Hardcode database credentials.
