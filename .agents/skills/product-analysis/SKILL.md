---
name: product-analysis
description: >-
  Use when starting a new project from a user idea. Analyzes the idea,
  generates requirements.json and product_spec.md, and identifies questions
  that need user clarification.
---

# Product Analysis Skill

## Purpose
Transform a natural-language app idea into structured requirements and a product specification.

## Steps

1. **Parse the idea** — extract core features, target users, platform (Android/Web/Backend).
2. **Identify assumptions** — list what's implied but not stated.
3. **Generate questions** — only ask if the answer changes architecture, cost, security, or legal exposure.
4. **Write `requirements.json`** — structured requirements following `schemas/requirements.schema.json`.
5. **Write `product_spec.md`** — human-readable product specification.
6. **Validate** — run schema validator on requirements.json.

## Output
- `state/artifacts/requirements.json`
- `state/artifacts/product_spec.md`
- Questions for user (if any), batched in one message.

## Never
- Assume paid services without asking.
- Skip non-functional requirements (performance, security, accessibility).
- Create requirements that can't be verified.
