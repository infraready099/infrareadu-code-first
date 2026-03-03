# Skill: Fix CI Failures

## Diagnosing GitHub Actions failures for InfraReady modules

### Step 1: Get the failing job logs
```bash
# List recent workflow runs
gh run list --limit 10

# Get logs for a specific run
gh run view <run-id> --log-failed
```

### Step 2: Common failure patterns and fixes

#### OpenTofu Validate failures
```
Error: An argument or block definition is required here
```
**Cause:** Semicolons in HCL (`{ type = string; default = "x" }`)
**Fix:** Expand to multi-line block syntax

```
Error: Unsupported argument
```
**Cause:** Wrong attribute name (e.g., `start_window_minutes` instead of `start_window`)
**Fix:** Check AWS provider docs for correct argument name

```
Error: Blocks of type "X" are not expected here
```
**Cause:** Nested inline blocks (e.g., `override_action { none {} }` on one line)
**Fix:** Expand to multi-line

#### TFLint failures
```
Warning: [module] Missing version constraint
```
**Fix:** Add `version = "~> 5.80"` to provider config in versions.tf

```
Error: variable "X" is declared but not used
```
**Fix:** Remove the variable or add a reference to it in main.tf

#### Checkov failures
If a check is invalid at module level, add to `.checkov.yaml`:
```yaml
skip-check:
  - CKV_AWS_XXX  # explanation of why
```

#### SOC2/HIPAA conformance check failures
The check greps for specific patterns — if your resource exists but grep fails, check exact string:
```bash
grep -r "aws_cloudtrail" packages/modules/ --include="*.tf"
```

### Step 3: Validate locally before pushing
```bash
cd packages/modules/<module>
tofu init -backend=false
tofu validate
```

### After fixing
Commit with clear message: `fix: <module> - <what was wrong>`
Check CI: `gh run list --limit 3`
