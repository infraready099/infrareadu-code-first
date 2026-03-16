# Skill: Codex Code Review

Run this after making code changes to get a second opinion on structure, quality, and improvements from OpenAI Codex CLI.

## When to invoke
- After implementing a new feature
- After a bug fix that touched multiple files
- When you want a structural review of changed code
- When code feels messy and you want refactor suggestions

---

## Step 1: Identify changed files

```bash
git diff --name-only HEAD
git diff --name-only --cached
```

Pick the files most relevant to the change (avoid config/lock files).

---

## Step 2: Run Codex review on changed files

For each changed TypeScript/JavaScript file, run:

```bash
codex "Review this file for code quality, structure, and improvements. Focus on: 1) naming clarity 2) unnecessary complexity 3) missing error handling 4) TypeScript type safety 5) anything that will cause bugs. Be specific and actionable." --file <path>
```

For a focused review of a specific concern:
```bash
codex "Look at the structure of this code. Suggest how to simplify or reorganize it without changing behavior." --file <path>
```

---

## Step 3: Review Codex suggestions

For each suggestion from Codex, decide:
- **Apply immediately** — clear improvement, no risk
- **Discuss with Kay** — architectural change, affects other systems
- **Skip** — not relevant to InfraReady's stack/constraints

---

## Step 4: Apply improvements

Use Edit tool to apply accepted suggestions. Keep changes focused — one concern at a time.

After applying, run relevant tests:
```bash
cd packages/runner && npm run build
cd apps/web && npm run build
```

---

## Step 5: Run Codex on the full diff for a final pass

```bash
git diff HEAD | codex "Review this git diff. Are there any structural issues, missing error handling, or improvements I should make before committing?"
```

---

## Codex review checklist

- [ ] All changed files reviewed
- [ ] TypeScript types are explicit (no `any` without reason)
- [ ] Error handling present at system boundaries
- [ ] No unnecessary complexity introduced
- [ ] Naming is clear and consistent with codebase
- [ ] Build passes after changes

---

## InfraReady-specific things to check

- OpenTofu HCL generator: variable names match module input names exactly
- Runner (Lambda): all async errors are caught and logged via `onLog("error", ...)`
- API routes: auth check before any DB operation
- Supabase queries: `.single()` only when exactly 1 row expected — use `.maybeSingle()` otherwise
- State key: always includes `project_name` prefix (`${projectName}/${module}/terraform.tfstate`)
