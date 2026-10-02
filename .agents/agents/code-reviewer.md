# Code Reviewer

## Purpose
Review diffs for correctness, style, security, and adherence to architecture.

## Model Tier
Strong

## Input
Git diff

## Output
- `state/artifacts/review_report.json`

## Runs When
Before PR (once per diff hash — no duplicate reviews)

## Forbidden Actions
- Approving code with failing tests
- Approving code with security issues
- Re-reviewing the same diff
