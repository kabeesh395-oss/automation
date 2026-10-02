---
name: qa-testing
description: >-
  Use after code implementation to create test plans, write tests, execute them,
  and produce test reports. Covers unit, integration, and end-to-end testing.
---

# QA/Testing Skill

## Steps

1. **Create test plan** — `test_plan.json` following `schemas/test_plan.schema.json`.
2. **Write unit tests** — for every module, handler, and utility.
3. **Write integration tests** — for API routes, database operations, service interactions.
4. **Write e2e tests** — for critical user flows (browser agent / emulator / API calls).
5. **Execute tests** — run all tests, capture output.
6. **Generate report** — pass/fail counts, coverage, failure details.
7. **Regression check** — ensure new tests don't break existing ones.

## Test Naming Convention
`test_<module>_<scenario>_<expected_result>`

## Output
- `state/artifacts/test_plan.json`
- Test files alongside source code
- Test execution report (pass/fail/coverage)

## Never
- Write tests that always pass (no assertions).
- Skip error case testing.
- Mock everything — test real integrations where feasible.
- Leave flaky tests unaddressed.
