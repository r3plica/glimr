---
name: gitflow-hotfix
description: 'Manage the full git-flow hotfix branch lifecycle for the Glimr gallery app. Use when the user asks to "create a hotfix", "start a hotfix", or "fix a bug on master/main". Covers: (1) Creating a git-flow hotfix branch from master, (2) After the fix is committed - finishing the hotfix which merges into both master and develop, (3) Pushing develop and master with tags, and (4) Cleaning up the local hotfix branch.'
license: MIT
allowed-tools: Bash
---

# Git Flow Hotfix Workflow (Glimr)

## Overview

Manages the complete lifecycle of a git-flow hotfix branch — from creation through merge to both `master` and `develop` — for urgent production fixes in Glimr.

## Trigger Phrases

Activate this skill when the user says:
- "create a hotfix [name]"
- "start a hotfix [name]"
- "fix a bug on master [name]"

## Prerequisites

Glimr uses git-flow. If `develop` and `master` branches do not yet exist, initialise once:

```bash
git flow init -d
```

---

## Phase 1: Start the Hotfix

When the user asks to start a hotfix, execute these steps in order:

### 1. Derive the hotfix version

Get the last release tag to determine the hotfix version:

```bash
git tag --sort=-version:refname | head -5
```

Increment the **patch** version (e.g. `v0.0.1` → `v0.0.2`). Hotfixes always bump the patch version.

Confirm the version with the user before proceeding.

### 2. Create the hotfix branch

```bash
git flow hotfix start <version>
```

This creates `hotfix/<version>` branched from `master`.

Confirm to the user which branch is now active before proceeding with any work.

---

## Phase 2: Finish the Hotfix (ONLY when user explicitly requests)

**CRITICAL: NEVER run Phase 2 autonomously or on autopilot.** When your fix is complete, you MUST:
1. State that the fix is complete and all tests pass
2. Tell the user you are waiting for their explicit instruction to merge/finish the hotfix
3. **STOP and WAIT** — do NOT proceed to Phase 2

Only run Phase 2 when the user **explicitly** says something like "merge it", "finish the hotfix", "we're done", or "go ahead and merge". Completing a fix does NOT mean you should merge. The user decides when to merge.

### 1. Remove dead code

Before running any quality gates, identify and remove all dead code introduced or exposed by the hotfix:
- Unused imports, unreferenced types/interfaces, orphaned modules
- Old component files that were replaced by new ones
- Any files or exports that are no longer imported anywhere

Commit the cleanup if there are changes:
```bash
git add -A
git commit -m "chore: remove dead code before quality gates

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### 2. Run ALL quality gates and verify they pass

**ALL THREE** of the following must pass **in this order** before proceeding. Do NOT finish the hotfix if ANY fails. Lint runs last so that any code changes made to fix earlier gates are also lint-checked.

#### a) Build
```bash
cmd /c "npm run build 2>&1" > build-results.txt
Get-Content build-results.txt | Select-Object -Last 10
```
Build must succeed with exit code 0. (`npm run build` runs `tsc -b && vite build`, so this also type-checks.)

#### b) Playwright E2E tests
```bash
cmd /c "npm run test:e2e -- --reporter=list 2>&1" > playwright-results.txt
Get-Content playwright-results.txt | Select-Object -Last 10
```
All e2e tests must pass with 0 failures.

#### c) Lint (ALWAYS LAST)
```bash
cmd /c "npm run lint 2>&1" > lint-results.txt
Get-Content lint-results.txt | Select-Object -Last 10
```
Zero lint errors allowed. Warnings are acceptable. Lint runs last to catch any style issues introduced while fixing earlier gate failures.

If any gate fails, fix the issue and **re-run from that gate onwards** (including lint again at the end).

### 3. Update the CHANGELOG

If `CHANGELOG.md` exists, update it with the hotfix version and commit it:

```bash
git add CHANGELOG.md
git commit -m "chore(release): prepare hotfix <version>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### 4. Finish the hotfix branch

```bash
git flow hotfix finish <version> -m "Hotfix <version>"
```

This will:
- Merge `hotfix/<version>` into `master`
- Tag `master` with `<version>`
- Merge `hotfix/<version>` back into `develop`
- Delete the local `hotfix/<version>` branch

### 5. Push develop, master, and tags

```bash
git push origin master
git push origin develop
git push origin --tags
```

### 6. Clean up (if the branch still exists locally)

```bash
git branch -d hotfix/<version> 2>/dev/null || true
```

---

## Safety Rules

- **NEVER** run `git flow hotfix finish` until the fix is tested, lint passes, build succeeds, all Playwright e2e tests pass, and the **user explicitly requests** the merge (e.g. "merge it", "finish the hotfix", "we're done")
- **NEVER** start Phase 2 autonomously — even if the fix is complete and tests pass, you MUST wait for the user to explicitly say to merge
- When your fix is done, state that the fix is complete and you are waiting for the user's instruction to merge
- **NEVER** use `--no-verify` or bypass pre-commit hooks
- **NEVER** force push to `develop` or `master`
- **ALWAYS** confirm the hotfix version with the user before starting
- Hotfix versions **always** increment the patch segment — never minor or major
- If `git flow hotfix finish` opens an editor for the tag message, pass `-m` to avoid interactive prompts
