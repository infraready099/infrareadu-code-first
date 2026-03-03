# InfraReady Runner Infrastructure

OpenTofu module that deploys InfraReady's own AWS backend resources — the deployment runner that executes customer infrastructure jobs.

## What this creates

| Resource | Name | Purpose |
|----------|------|---------|
| ECR Repository | `infraready-runner` | Stores the runner container image |
| SQS FIFO Queue | `infraready-deploy.fifo` | Receives deployment job messages |
| SQS DLQ | `infraready-deploy-dlq.fifo` | Catches failed jobs after 3 attempts |
| Lambda Function | `infraready-runner` | Processes one deployment job at a time |
| Lambda IAM Role | `infraready-runner-role` | Least-privilege: STS AssumeRole + SQS + ECR + CloudWatch |
| CloudWatch Log Group | `/aws/lambda/infraready-runner` | 30-day retention |

## Deploy order

### First apply (creates ECR, queues, Lambda placeholder)

```bash
cd infra/runner
tofu init
tofu apply -var="supabase_url=https://xxx.supabase.co" \
           -var="supabase_service_role_key=eyJ..."
```

This creates all resources. The Lambda will exist but can't invoke yet — no image.

### Build and push the runner image

```bash
# From repo root
cd packages/runner && npm run build   # produces dist/index.js

# Tag and push to ECR (get the URL from tofu output)
ECR_URL=$(cd infra/runner && tofu output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URL
docker build -f packages/runner/Dockerfile -t infraready-runner .
docker tag infraready-runner $ECR_URL:latest
docker push $ECR_URL:latest
```

### Second apply (wires Lambda to real image)

```bash
tofu apply -var="ecr_image_uri=$ECR_URL:latest" \
           -var="supabase_url=..." \
           -var="supabase_service_role_key=..."
```

Lambda is now live and will process deployment jobs from SQS.

## Environment variables (set in Next.js app)

After first apply, get the SQS queue URL for the web app:

```bash
tofu output sqs_queue_url
# → set as DEPLOY_QUEUE_URL in apps/web/.env.local
```

## Architecture

```
Next.js /api/deploy  →  SQS FIFO  →  Lambda (infraready-runner)
                                           ↓
                                    Assume customer IAM role
                                           ↓
                                    tofu init + plan + apply
                                           ↓
                                    Stream logs → Supabase
```
