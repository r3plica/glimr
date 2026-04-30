---
name: gitflow-feature
description: 'Manage the full git-flow feature branch lifecycle for the Glimr gallery app. Use when the user asks to "start a new feature", "begin a feature", "create a feature branch", or for any non-urgent code change. Covers: (1) Checking out and pulling develop, (2) Creating a git-flow feature branch, (3) After task completion - finishing the feature, creating a release branch derived from the last tag, finishing the release, pushing develop and main, and cleaning up local branches.'
license: MIT
allowed-tools: Bash
---

# Git Flow Feature Workflow (Glimr)

## Overview

Manages the complete lifecycle of a git-flow feature branch — from creation through release — following the Vincent Driessen branching model. This is the default flow for any code change in Glimr that is not an urgent production fix.

## Trigger Phrases

Activate this skill when the user says:
- "start a new feature [name]"
- "begin a feature [name]"
- "create a feature branch [name]"
- Any code-change request that is not an urgent fix on main

## Prerequisites

Glimr uses git-flow. If `develop` and `main` branches do not yet exist, initialise once:

```bash
git flow init -d
```

(`-d` accepts default names: `main`, `develop`, `feature/`, `release/`, `hotfix/`.)

## Phase 1: Start the Feature

When the user asks to start a feature, execute these steps in order:

### 1. Switch to develop and pull latest

```bash
git checkout develop
git pull origin develop
```

### 2. Create the feature branch

```bash
git flow feature start <feature-name>
```

The feature branch will be named `feature/<feature-name>` automatically by git-flow.

Confirm to the user which branch is now active before proceeding with any work.

---

## Phase 2: Finish the Feature (ONLY when user explicitly requests)

**CRITICAL: NEVER run Phase 2 autonomously or on autopilot.** When your implementation work is complete, you MUST:
1. State that the task is complete and all tests pass
2. Tell the user you are waiting for their explicit instruction to merge/finish the feature
3. **STOP and WAIT** — do NOT proceed to Phase 2

Only run Phase 2 when the user **explicitly** says something like "merge it", "finish the feature", "we're done", or "go ahead and merge". Completing a task does NOT mean you should merge. The user decides when to merge.

### 1. Remove dead code

Before running any quality gates, identify and remove all dead code introduced or exposed by the feature work:
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

**ALL THREE** of the following must pass **in this order** before proceeding. Do NOT finish the feature if ANY fails. Lint runs last so that any code changes made to fix earlier gates are also lint-checked.

#### a) Build
```bash
cmd /c "npm run build 2>&1" > build-results.txt
Get-Content build-results.txt | Select-Object -Last 10
```
Build must succeed with exit code 0. (`npm run build` runs `tsc -b && vite build`, so this also type-checks.)

#### b) Unit tests (Vitest)
```bash
cmd /c "npm run test 2>&1" > test-results.txt
Get-Content test-results.txt | Select-Object -Last 10
```
All Vitest suites must pass.

#### c) Playwright E2E tests
```bash
cmd /c "npm run test:e2e -- --reporter=list 2>&1" > playwright-results.txt
Get-Content playwright-results.txt | Select-Object -Last 10
```
All e2e tests must pass with 0 failures.

#### d) Lint (ALWAYS LAST)
```bash
cmd /c "npm run lint 2>&1" > lint-results.txt
Get-Content lint-results.txt | Select-Object -Last 10
```
Zero lint errors allowed. Warnings are acceptable. Lint runs last to catch any style issues introduced while fixing earlier gate failures.

If any gate fails, fix the issue and **re-run from that gate onwards** (including lint again at the end).

### 3. Finish the feature branch

```bash
git flow feature finish <feature-name>
```

This merges `feature/<feature-name>` into `develop` and deletes the feature branch locally.

### 4. Derive the next release version

Get the last release tag to determine the next version:

```bash
git tag --sort=-version:refname | head -5
```

Increment the **patch** version by default (e.g. `v0.0.1` → `v0.0.2`).
Ask the user if a **minor** or **major** bump is more appropriate for the changes made.

### 5. Update the CHANGELOG

If `CHANGELOG.md` exists, update it with the new version section and commit it to develop:

```bash
git add CHANGELOG.md
git commit -m "chore(release): prepare release <version>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### 6. Start the release branch

```bash
git flow release start <version>
```

### 7. Finish the release branch

```bash
git flow release finish <version> -m "Release <version>"
```

This will:
- Merge `release/<version>` into `main`
- Tag `main` with `<version>`
- Merge `release/<version>` back into `develop`
- Delete the local `release/<version>` branch

### 8. Push develop, main, and tags

```bash
git push origin develop
git push origin main
git push origin --tags
```

### 9. Clean up (if branches still exist locally)

```bash
git branch -d feature/<feature-name> 2>/dev/null || true
git branch -d release/<version> 2>/dev/null || true
```

---

## Version Bump Guidelines

| Change Type        | Bump   | Example              |
| ------------------ | ------ | -------------------- |
| Bug fix / patch    | Patch  | v0.0.1 → v0.0.2      |
| New functionality  | Minor  | v0.0.1 → v0.1.0      |
| Breaking change    | Major  | v0.0.1 → v1.0.0      |

---

## Safety Rules

- **NEVER** run `git flow feature finish` until lint passes, build succeeds, all Playwright e2e tests pass, and the **user explicitly requests** the merge (e.g. "merge it", "finish the feature", "we're done")
- **NEVER** start Phase 2 autonomously — even if all tasks are complete and tests pass, you MUST wait for the user to explicitly say to merge
- When your implementation work is done, state that the task is complete and you are waiting for the user's instruction to merge
- **NEVER** use `--no-verify` or bypass pre-commit hooks
- **NEVER** force push to `develop` or `main`
- **ALWAYS** confirm the feature name and version with the user before finishing
- If `git flow release finish` opens an editor for the tag message, pass `-m` to avoid interactive prompts
