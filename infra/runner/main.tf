locals {
  name = "infraready-runner"

  # image_uri falls back to a placeholder so `tofu plan` works before the
  # first image build. Lambda will fail to invoke until a real image is pushed
  # and this module is re-applied with var.ecr_image_uri set.
  image_uri = var.ecr_image_uri != "" ? var.ecr_image_uri : "${aws_ecr_repository.runner.repository_url}:latest"

  common_tags = merge(var.tags, {
    Project   = "infraready"
    Component = "runner"
    ManagedBy = "opentofu"
  })
}

# ─── ECR REPOSITORY ──────────────────────────────────────────────────────────
# Stores the runner container image. The Dockerfile lives at
# packages/runner/Dockerfile and is built + pushed by the CI pipeline.

resource "aws_ecr_repository" "runner" {
  name                 = local.name
  image_tag_mutability = "MUTABLE"  # :latest tag is overwritten on each build
  force_delete         = true       # allows destroy even when images are present

  image_scanning_configuration {
    scan_on_push = true  # free basic scanning — catches known CVEs on every push
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "runner" {
  repository = aws_ecr_repository.runner.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the 10 most recent images to control storage cost"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ─── SQS DEAD-LETTER QUEUE ───────────────────────────────────────────────────
# Must be created before the main queue so its ARN can be referenced in the
# redrive policy. After 3 failed receive attempts the message lands here for
# manual inspection / replay.

resource "aws_sqs_queue" "deploy_dlq" {
  name                        = "infraready-deploy-dlq.fifo"
  fifo_queue                  = true
  content_based_deduplication = true

  message_retention_seconds = 1209600  # 14 days — long enough for manual review
}

# ─── SQS DEPLOY QUEUE ────────────────────────────────────────────────────────
# FIFO ensures deployments for the same project cannot run concurrently
# (message group ID = projectId in the producer). Visibility timeout matches
# Lambda max execution time so a running job is never requeued mid-flight.

resource "aws_sqs_queue" "deploy" {
  name                        = "infraready-deploy.fifo"
  fifo_queue                  = true
  content_based_deduplication = true

  visibility_timeout_seconds = 900   # 15 min — matches Lambda timeout exactly
  message_retention_seconds  = 86400 # 1 day — failed jobs don't pile up forever

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.deploy_dlq.arn
    maxReceiveCount     = 3
  })
}

# ─── LAMBDA IAM ROLE ─────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda" {
  name        = "${local.name}-role"
  description = "Execution role for the InfraReady deploy runner Lambda."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaAssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda" {
  name = "${local.name}-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # The runner's core job: assume the customer's InfraReadyRole.
      # Resource "*" is intentional — the target ARN is determined at runtime
      # from the deployment job payload (different for every customer account).
      {
        Sid      = "AssumeCustomerRoles"
        Effect   = "Allow"
        Action   = "sts:AssumeRole"
        Resource = "*"
      },
      # SQS — receive and delete messages from the deploy queue only.
      # GetQueueAttributes is required by the Lambda SQS trigger.
      {
        Sid    = "SQSConsumeDeployQueue"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.deploy.arn
      },
      # CloudWatch Logs — write Lambda execution logs.
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.runner.arn}:*"
      },
      # ECR — pull the runner image at cold start.
      # GetAuthorizationToken operates at the account level (no resource ARN).
      {
        Sid    = "ECRGetToken"
        Effect = "Allow"
        Action = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "ECRPullImage"
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability"
        ]
        Resource = aws_ecr_repository.runner.arn
      }
    ]
  })
}

# ─── CLOUDWATCH LOG GROUP ─────────────────────────────────────────────────────
# Explicit resource so we control the retention period. Without this, Lambda
# creates the group automatically with no retention (logs accumulate forever).

resource "aws_cloudwatch_log_group" "runner" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = 30
}

# ─── LAMBDA FUNCTION ─────────────────────────────────────────────────────────

resource "aws_lambda_function" "runner" {
  function_name = local.name
  description   = "InfraReady deploy runner — pulls SQS jobs, assumes customer IAM role, runs OpenTofu."

  package_type = "Image"
  image_uri    = local.image_uri

  role = aws_iam_role.lambda.arn

  timeout     = 900  # 15 min — maximum Lambda timeout; matches SQS visibility_timeout
  memory_size = 1024 # OpenTofu + Node.js + multiple tofu processes need headroom

  environment {
    variables = {
      SUPABASE_URL              = var.supabase_url
      SUPABASE_SERVICE_ROLE_KEY = var.supabase_service_role_key
      MODULES_PATH              = "/var/task/modules"
      OPENTOFU_PATH             = "/opt/opentofu/tofu"
    }
  }

  depends_on = [
    # Ensure the log group is created before Lambda so the first invocation
    # does not race against automatic group creation.
    aws_cloudwatch_log_group.runner
  ]
}

# ─── SQS EVENT SOURCE MAPPING ────────────────────────────────────────────────
# batch_size = 1: process exactly one deployment job per Lambda invocation.
# A single deployment can run for 15 minutes — batching multiple jobs would
# cause all but the first to time out inside a single invocation.

resource "aws_lambda_event_source_mapping" "sqs_to_lambda" {
  event_source_arn = aws_sqs_queue.deploy.arn
  function_name    = aws_lambda_function.runner.arn
  batch_size       = 1
  enabled          = true
}
