# Git Safety Rules — Always Active

## Branch Protection

1. **Never push directly to `main` or `master`.** All changes go through `feature/*` or `fix/*` branches, merged via PR to `development`.
2. **Never use `git push --force`.** Force pushes destroy history and are forbidden.
3. **Never discard uncommitted user changes.** If uncommitted changes exist, stash or branch around them before proceeding.

## Branch Strategy

- `main` ← `development` ← `feature/*` | `fix/*`
- `main` is protected. Only merge from `development` with approval.
- `development` is the integration branch. Feature branches merge here.

## Preflight (Before EVERY Autonomous Task)

1. Run `git status` — detect uncommitted user changes and preserve them.
2. Check current branch — refuse to operate on protected branches (`main`, `master`).
3. Read recent commits (`git log -n 10`) for context.
4. Read only relevant files; use file-hash cache to skip unchanged.
5. Understand existing architecture before making changes.
6. Plan the smallest change needed.
7. Implement → test → verify with `git diff`.

## Commit Standards

- Clear, descriptive commit messages using conventional commits.
- Every significant commit includes: test result, changed-file summary, verification status.
- Example: `feat(auth): add login endpoint [tests: 18/18, verify: pass]`

## PR Standards

- PR from `feature/*` → `development` with:
  - Commit summaries
  - Test results
  - Changed files list
  - Verification status
  - Link to verification_report.json
