# GitHub App Setup — InfraReady

This document describes how to create and configure the InfraReady GitHub App.
The App enables customers to connect their GitHub repos so InfraReady can:

- Detect which repos exist in the installation
- Receive `push` events and trigger auto-deploys
- (Future) Read repo contents to detect language/framework and generate Dockerfiles

---

## Step 1 — Create the GitHub App

Go to **GitHub Settings > Developer Settings > GitHub Apps > New GitHub App**
(or: https://github.com/settings/apps/new)

### Basic information

| Field | Value |
|-------|-------|
| GitHub App name | `InfraReady` |
| Description | Deploy your app to your own AWS in 20 minutes. No DevOps. |
| Homepage URL | `https://infraready.io` |

### Identifying and authorizing users

| Field | Value |
|-------|-------|
| Callback URL | `https://infraready.io/api/github/callback` |
| Request user authorization (OAuth) during installation | Leave **unchecked** — we use Supabase Auth, not GitHub OAuth for user auth |
| Expire user authorization tokens | N/A (not using user auth tokens) |

### Post installation

| Field | Value |
|-------|-------|
| Setup URL (optional) | `https://infraready.io/api/github/callback` |
| Redirect on update | **Checked** — so updates re-run our callback |

### Webhook

| Field | Value |
|-------|-------|
| Active | **Checked** |
| Webhook URL | `https://infraready.io/api/github/webhook` |
| Webhook secret | Generate a strong random string (`openssl rand -hex 32`) and save as `GITHUB_WEBHOOK_SECRET` |

### Permissions

Set the following **repository** permissions:

| Permission | Level | Why |
|-----------|-------|-----|
| Contents | Read-only | Read repo to detect language/Dockerfile (future) |
| Metadata | Read-only | Required by GitHub for all Apps |

No **account** or **organization** permissions are needed.

### Subscribe to events

Check the following events:

| Event | Why |
|-------|-----|
| `push` | Trigger deployment when customer pushes to their deploy branch |
| `installation` | Know when the app is installed/uninstalled (optional but useful for cleanup) |

### Where can this GitHub App be installed?

Select **Any account** so customers can install it on their personal accounts or org accounts.

---

## Step 2 — After creating the App

### Collect these values and add to Vercel env vars + `.env.example`

| Env var | Where to find it |
|---------|-----------------|
| `GITHUB_APP_ID` | App settings page — "App ID" (numeric) |
| `GITHUB_APP_SLUG` | App settings page — the slug in the public URL, e.g. `infraready-deploy` |
| `GITHUB_APP_PRIVATE_KEY` | App settings > "Generate a private key" — download the `.pem` file |
| `GITHUB_WEBHOOK_SECRET` | The secret you set above |

### Private key formatting for environment variables

GitHub gives you a `.pem` file. For Vercel, you have two options:

**Option A — single-line with `\n` (recommended):**
```bash
# Convert newlines to literal \n for pasting into Vercel
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' private-key.pem
```
Then set `GITHUB_APP_PRIVATE_KEY` to that one-liner.

**Option B — base64 encode:**
```bash
base64 -i private-key.pem | tr -d '\n'
```
Then in code, `Buffer.from(key, 'base64').toString('utf8')`.

---

## Step 3 — Install the App on InfraReady's own repos (optional)

For internal testing, install the App on `infraready099/infrareadu-code-first` via:
`https://github.com/apps/<your-slug>/installations/new`

---

## How customers connect their repo

1. Customer is in the InfraReady wizard, Step 1 (repo selection).
2. They click "Connect GitHub" — frontend calls `GET /api/github/connect?projectId=<id>`.
3. That route redirects them to `https://github.com/apps/infraready-deploy/installations/new?state=<projectId>`.
4. Customer selects their repo and approves the installation.
5. GitHub redirects back to `https://infraready.io/api/github/callback?installation_id=<id>&state=<projectId>`.
6. Our callback saves `installation_id` to the project row.
7. All future pushes to the project's deploy branch trigger automatic deploys.

---

## Webhook event flow (push to main)

```
Customer git push → GitHub → POST /api/github/webhook
  ├── Verify HMAC-SHA256 signature
  ├── Find project by installation_id + repo owner + repo name
  ├── Check ref matches github_branch (default: main)
  ├── Create deployments row (status: queued)
  ├── Send job to SQS
  └── Update projects.status = "deploying"

SQS → Lambda runner (packages/runner/src/index.ts)
  ├── Assume customer IAM role
  ├── Run security scan (Checkov)
  ├── Deploy OpenTofu modules (vpc, rds, ecs, storage, security)
  ├── Generate GitHub Actions workflow YAML
  └── Save outputs + workflow YAML to deployments.outputs
```

---

## GitHub Actions OIDC trust (customer's AWS account)

After deploy, InfraReady shows the customer a `.github/workflows/deploy.yml` file.
That workflow uses GitHub OIDC to authenticate to AWS — no long-lived keys needed.

The customer's AWS account needs a GitHub OIDC provider. The InfraReady security
module should create this (flag for a future sprint — add to `packages/modules/security/`):

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}
```

And a deploy role that trusts this provider, scoped to the customer's specific repo:

```hcl
data "aws_iam_policy_document" "github_oidc_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo_owner}/${var.github_repo_name}:ref:refs/heads/${var.github_branch}"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}
```

This role gets permissions to: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`,
`ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`,
`ecs:UpdateService`, `ecs:DescribeServices`, `ecs:DescribeTaskDefinition`.
