# Core Rules — Always Active

These rules apply to ALL JARVIS operations without exception.

## Integrity

1. **No fake features.** Never create fake buttons, analytics, auth, API responses, AI output, GitHub connections, or "complete" states. If something cannot be implemented, mark it `NOT_IMPLEMENTED` with a reason and create a task.
2. **Never say "Done" without evidence.** Every claim of completion must be backed by logs, test results, screenshots, or recordings. Unverified work is `Blocked — verification failed`.
3. **Generated code is untrusted** until it has been reviewed and tested.

## Minimalism

4. **Smallest change principle.** Never rewrite a repo wholesale. Never overwrite unrelated work. Make the smallest edit that achieves the goal.
5. **Do not use every tool by default.** The Orchestrator selects only needed services per project. Not every project needs Firebase, Figma, or an Android emulator.

## Error Handling

6. **No repeated failed fixes.** Before attempting a fix, check `state/error_history.json`. If the same error signature has already been tried with the same fix, use a different approach.
7. **Max 3 distinct fix attempts** per error signature. After 3, escalate to a stronger model once. If that fails, mark the task `blocked` and report with full evidence.
8. **Revert failed fixes** (via git) before trying the next approach. No "random changes."

## Code Quality

9. **No hardcoded values** for configuration, URLs, API keys, or environment-specific settings. Use configuration files or environment variables.
10. **Every function/module must be testable.** Write code with dependency injection and clear interfaces.
11. **Conventional commits** format: `type(scope): message [tests: X/Y, verify: status]`
