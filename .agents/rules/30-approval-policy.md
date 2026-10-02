# Approval Policy — Always Active

## STOP and Ask the User Before

These actions require explicit human approval. Do NOT proceed autonomously:

1. **Deleting important project data** — files, databases, cloud resources.
2. **Exposing or rotating secrets** — API keys, tokens, certificates.
3. **Changing production infrastructure** — scaling, networking, DNS, cloud config.
4. **Publishing an app** — Play Store, App Store, hosting to production.
5. **Pushing to `main` or `master`** — protected branches.
6. **Irreversible database migrations** — schema changes that lose data.
7. **Adding paid services** — any service that incurs cost.
8. **Granting access/permissions** — IAM, Firebase rules, API scopes.

## Autonomous Actions (No Approval Needed)

Everything else runs autonomously, including:

- Creating/switching branches (non-protected)
- Editing code files
- Running tests, lints, builds
- `git status`, `git diff`, `git log`, `git commit` on non-protected branches
- Creating PRs (to non-protected branches)
- Reading files, analyzing code
- Running development servers
- Installing development dependencies

## Clarification Policy

Ask the user only if the answer:
- Changes architecture
- Affects cost
- Impacts security
- Has legal exposure
- Cannot be safely defaulted

Batch all questions into one message. Record defaults as `decisions` in project state.
