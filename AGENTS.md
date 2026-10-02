# JARVIS — Autonomous Software-Development Orchestrator

> This file is the router. Detail lives in `.agents/rules/`, `.agents/skills/`, and `docs/`.

---

## Mission

Build **JARVIS**: a reusable orchestration framework. Input: one natural-language app idea. Output: a verified, release-ready app (Android / Web / Backend API) with PR, docs, and verification report.
**First build and verify the framework itself. Do not build a sample app first.**

## Non-Negotiable Rules

1. **No fake features.** No fake buttons, analytics, auth, API responses, AI output, GitHub connections, or "complete" states. Unimplementable → mark `NOT_IMPLEMENTED`, state why, create a task.
2. **Never say "Done" without evidence.** Unverified → `Blocked — verification failed` + what failed, evidence, attempted fixes, remaining action.
3. **Smallest change.** Never rewrite a repo wholesale. Never overwrite unrelated work.
4. **No secrets in code.** Env vars / secret manager only. Secret scanning is mandatory.
5. **Generated code is untrusted** until reviewed and tested.
6. **Do not use every tool by default.** Orchestrator selects only needed services.
7. **No repeated failed fixes.** Check `error_history.json` first.

## Human Approval Required (STOP and ask)

- Deleting important project data
- Exposing/rotating secrets
- Changing production infrastructure
- Publishing an app (Play Store, hosting prod)
- Pushing to `main`/`master`
- Irreversible DB migrations

Everything else (branches, edits, tests, builds, PRs) runs autonomously.

## Architecture Overview

```
USER IDEA
  → Master Orchestrator (state machine, owns project_state.json)
      → Product Analyst        → requirements.json
      → UX/UI Architect        → ux_plan.json
      → Software Architect     → architecture.json
      → Implementation planner → task_queue.json
      → Engineers (FE/Android, BE, AI/Gemini, DB)  → code on feature/*
      → QA/Test Engineer       → test_plan.json, tests
      → Build/Release Engineer → build + artifact
      → Security Engineer      → security_report.json
      → Code Reviewer          → review_report.json
      → Gates 1–7              → verification_report.json
      → PR (never direct to main)
```

## Execution Model

Use agent roles defined in `.agents/agents/`. Run independent tasks in parallel, serialize dependent ones. Orchestrator is the only role that mutates `project_state.json`; workers return structured results.

## Artifact Chain

`requirements.json → architecture.json → implementation_plan.json → task_queue.json → test_plan.json → verification_report.json`

Each file has a JSON Schema in `schemas/`; the validator rejects malformed output.

## Automation Flow (`/jarvis-build "<idea>"`)

0. **Preflight** — environment + Git inspection.
1. **Understand** → requirements.json
2. **Spec** → product_spec.md
3. **Stack decision** → architecture.json
4. **UX plan** (if UI needed)
5. **Init project** → `development` branch, then `feature/*`
6. **Plan** → implementation_plan.json → task_queue.json
7. **Implement** tasks (parallel where independent)
8. **Tests** generated alongside code
9. **Build** → on error enter Recovery
10. **Run gates 1–7**; failure routes to owning stage
11. **Docs** + verification_report.json
12. **PR** `feature/*` → `development`
13. **Release artifact** — publishing needs approval.

## Git Rules

Branches: `main ← development ← feature/* | fix/*`. Protect `main`.
Never `push --force`, never touch `main` directly, never discard uncommitted user changes.

## Verification Gates

| Gate | Check | On fail → |
|---|---|---|
| 1 Requirements | Every req mapped to code/test | Planner / Engineers |
| 2 Build | Clean build succeeds | Recovery |
| 3 Tests | All tests pass | Recovery / QA |
| 4 Runtime | App launches | Recovery |
| 5 Feature | Key flows e2e | Engineers |
| 6 Security | Scan clean, no dangerous config | Security + Engineers |
| 7 Release | Valid artifact + checksum | Build/Release |

A gate is `pass` only with attached evidence.

## Recovery

`ERROR → collect logs → classify → root cause → check error_history → create fix (different from past) → apply → rebuild → rerun tests → verify → continue`

Max 3 distinct attempts per error signature, then escalate, then mark `blocked`.

## Observability

Every action appends to `state/activity.log` and `state/activity.jsonl`.

## Detail Files

- Rules: `.agents/rules/`
- Skills: `.agents/skills/`
- Agent roles: `.agents/agents/`
- Schemas: `schemas/`
- State: `state/`
- Docs: `docs/`
