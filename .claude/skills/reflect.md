# Skill: End-of-Session Reflection

Run this at the end of any significant work session to capture learning and update persistent memory.

## When to invoke
- After completing a major feature or module
- After debugging a CI failure or production issue
- After making an architecture decision
- Weekly at minimum, even if no major work happened

---

## Step 1: What did we build or fix this session?

Answer these:
- What was the goal at the start of the session?
- What was actually completed?
- What's still in progress or deferred?

---

## Step 2: Mistakes & Near-Misses

For each problem encountered this session, add an entry to `memory/lessons-learned.md`:

```markdown
### YYYY-MM-DD | <Short title of the mistake>
**What went wrong:** <What the symptom was>
**Root cause:** <Why it actually happened>
**Fix:** <What resolved it>
**Rule:** <The one-line rule to never repeat this>
```

Only add entries that are **new** — don't duplicate existing lessons.

---

## Step 3: Decisions Made

For each architecture or product decision made this session, add an entry to `memory/decisions-log.md`:

```markdown
### YYYY-MM-DD | <Decision title>
**Decision:** <What was decided>
**Why:** <Rationale — the business and technical reasons>
**Trade-offs:** <What we give up>
**Outcome:** <Active / Deferred / Reversed — and current status>
```

---

## Step 4: Update MEMORY.md

Update these sections in `memory/MEMORY.md`:

1. **Current Sprint** — what's actively in progress right now
2. **Recent Wins** — update with what was completed this session (keep last 3)
3. **Open Questions for Kay** — add any unresolved product/business questions
4. **Next Priorities** — the top 3 things to tackle next session

---

## Step 5: CLAUDE.md Check

Review `CLAUDE.md` for anything that's now outdated or incomplete:
- Module list changed? Update it.
- New HCL rule discovered? Add to Critical HCL Rules section.
- CI pipeline changed? Update.

---

## Step 6: Git state

```bash
git status
git log --oneline -5
```

Confirm all changes are committed with clear messages. No uncommitted work left behind.

---

## Reflect checklist

- [ ] lessons-learned.md updated with new mistakes
- [ ] decisions-log.md updated with new decisions
- [ ] MEMORY.md current sprint / wins / questions / next updated
- [ ] CLAUDE.md still accurate
- [ ] All work committed to git
- [ ] Next session's starting point is clear
