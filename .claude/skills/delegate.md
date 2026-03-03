# Skill: Delegate to the Right Agent

Orchestration playbook. Use this to decide which agent handles a task, how to hand off work, and how to chain agents for complex workflows.

---

## The Team Roster

| Agent | Model | Cost | What it does |
|-------|-------|------|-------------|
| `module-builder` | Haiku | $ | Scaffold new OpenTofu modules |
| `ci-debugger` | Haiku | $ | Diagnose + fix GitHub Actions failures |
| `compliance-checker` | Haiku | $ | SOC2/HIPAA audit of modules (read-only) |
| `research-agent` | Haiku | $ | Market research, competitor intel |
| `explorer` | Haiku | $ | Find files/code in the codebase |
| `principal-engineer` | Sonnet | $$$$ | Complex architecture, backend/frontend code |

**Rule: Use Haiku agents first. Only escalate to Sonnet (`principal-engineer`) when the task requires real architectural reasoning or complex multi-file code.**

---

## Decision Tree: Which Agent for Which Task?

### "We need a new OpenTofu module"
1. → `module-builder`: scaffold the files, validate, update CI matrix
2. → `compliance-checker`: audit the new module for SOC2/HIPAA gaps
3. → `principal-engineer`: implement complex resource logic (if needed)

### "CI is failing"
1. → `ci-debugger`: diagnose and fix
2. → `compliance-checker`: if soc2-check or hipaa-check is failing
3. → `principal-engineer`: only if fix requires architectural decision

### "Is this module SOC2/HIPAA compliant?"
1. → `compliance-checker`: run full audit, get gap report
2. → `principal-engineer`: implement the fixes the checker identified

### "What are our competitors doing?"
1. → `research-agent`: full competitive analysis with sources

### "Where is X in the codebase?"
1. → `explorer`: fast file/pattern search, returns exact paths + line numbers
2. Feed results to whichever agent needs them next

### "Build a new backend API endpoint / frontend component"
1. → `explorer`: find existing patterns to follow
2. → `principal-engineer`: write the actual code

### "Architecture decision: should we use X or Y?"
1. → `research-agent` (if external data needed): get market context
2. → `principal-engineer`: make the technical recommendation
3. → Kay: approve if it's strategic (pricing, new market, irreversible)

---

## Handoff Format (how to give a task to an agent)

Always give an agent:
1. **What to do** — specific, not vague ("build a KMS module that does X" not "add encryption")
2. **Context it needs** — what other agents have already done
3. **What to return** — exact output format you need
4. **Escalation rule** — what to do if it hits a blocker

Example handoff to `module-builder`:
```
Build a new OpenTofu module at packages/modules/secrets-manager/
It should manage aws_secretsmanager_secret + aws_secretsmanager_secret_rotation.
Use the standard versions.tf. Variables needed: project_name, environment, tags, kms_key_arn.
Return: list of files created + tofu validate result.
Escalate to principal-engineer if you hit resource config issues you can't resolve.
```

---

## Chaining Agents (multi-step workflows)

### New module → production-ready
```
module-builder → compliance-checker → principal-engineer (fix gaps) → ci-debugger (if CI fails)
```

### Customer asks "am I SOC2 compliant?"
```
compliance-checker (audit all modules) → principal-engineer (fix gaps) → compliance-checker (re-audit)
```

### Competitive research → product decision
```
research-agent (market data) → Kay (decide) → principal-engineer (implement)
```

### CI broken after new module
```
ci-debugger (diagnose) → if HCL error: fix directly | if architecture issue: principal-engineer
```

---

## Cost Awareness

- `explorer` for search: ~$0.001 per run
- `compliance-checker` for audit: ~$0.005 per run
- `module-builder` for new module: ~$0.01-0.05 per run
- `principal-engineer` for complex code: ~$0.10-0.50 per run

**Chain Haiku agents to gather context before invoking Sonnet.**
Don't ask `principal-engineer` to search for files — use `explorer` first and pass results in.

---

## Red Flags (escalate to Kay, not just an agent)

- Task changes pricing, billing, or customer contracts
- Task involves deleting customer infrastructure or data
- Task adds >$50/mo to customer's AWS bill
- Task is irreversible and has no clear rollback path
- Task changes the core BYOC model or security architecture
