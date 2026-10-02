---
name: debug-recovery
description: >-
  Use when a build, test, or runtime error occurs. Runs the recovery loop:
  collect logs, classify error, find root cause, apply a novel fix, verify.
---

# Debug Recovery Skill

## Recovery Loop

```
ERROR → collect logs → classify → root cause → check error_history
      → create fix (different from past attempts) → apply → rebuild
      → rerun affected tests → verify → continue
```

## Steps

1. **Collect logs** — full, not truncated. Save to `state/artifacts/`.
2. **Compute error signature** — hash the key error indicators.
3. **Check history** — read `state/error_history.json` for this signature.
4. **Identify root cause** — write hypothesis.
5. **Choose a fix** — must NOT match any previously attempted fix for this signature.
6. **Apply minimal fix** — smallest change possible.
7. **Rebuild** — run the build again.
8. **Rerun affected tests** — only tests related to the fix.
9. **Record outcome** — append to `state/error_history.json`.

## Error History Entry Schema
```json
{
  "id": "E-001",
  "task_id": "T-0012",
  "signature": "<hash>",
  "log_excerpt": "...",
  "root_cause": "...",
  "attempted_fix": "...",
  "result": "success|failed",
  "timestamp": "ISO8601"
}
```

## Escalation Rules
- Same signature + same fix = **forbidden**
- Max **3 distinct attempts** per signature
- After 3 → escalate to stronger model once
- If still failing → mark task `blocked`, report with evidence
- **Always revert failed fixes** (git) before trying next approach

## Never
- Repeat a failed fix.
- Change unrelated files.
- Make "random changes" hoping something works.
- Skip the revert step before trying a new fix.
