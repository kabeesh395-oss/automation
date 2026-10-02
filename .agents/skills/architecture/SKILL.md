---
name: architecture
description: >-
  Use after product analysis to design the software architecture. Produces
  architecture.json with stack decisions, component design, and API contracts.
---

# Architecture Skill

## Purpose
Design the software architecture based on requirements and UX plan.

## Steps

1. **Review inputs** — `requirements.json`, `ux_plan.json` (if UI exists).
2. **Select stack** — choose only needed tools/frameworks. Justify each choice.
3. **Design components** — modules, services, data models, API contracts.
4. **Define boundaries** — what runs where (client/server/cloud).
5. **Write `architecture.json`** — following `schemas/architecture.schema.json`.
6. **Validate** — run schema validator.

## Tool Selection Matrix

| Need | Tool |
|---|---|
| Autonomous execution | Antigravity (editor, terminal, browser agent) |
| Reasoning/code/review | Gemini (strong for architecture; fast for simple edits) |
| Source of truth, PRs | GitHub (+ GitHub MCP) |
| CI | GitHub Actions |
| Auth/DB/Storage | Firebase — only if requirements need it |
| Android build | Android SDK, Gradle — only for Android targets |
| UI design | Figma — only if visual design required |

## Output
- `state/artifacts/architecture.json`

## Never
- Select tools the project doesn't need.
- Design for scalability requirements that don't exist.
- Skip security considerations in the architecture.
