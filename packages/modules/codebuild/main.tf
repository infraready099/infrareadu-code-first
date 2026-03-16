locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "codebuild"
  })
}

data "aws_caller_identity" "current" {}

# ─── CLOUDWATCH LOG GROUP ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/infraready/${local.name}/codebuild"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# ─── S3 ARTIFACTS BUCKET ─────────────────────────────────────────────────────
# Stores built APK/AAB/IPA files from each run. Versioning enabled so we
# can roll back to any previous build artifact.

resource "aws_s3_bucket" "artifacts" {
  bucket        = "${local.name}-mobile-artifacts-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = merge(local.common_tags, {
    Name = "${local.name}-mobile-artifacts"
  })
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ─── SECRETS MANAGER — MOBILE SIGNING CREDENTIALS ────────────────────────────
# Secrets are created empty. After deploying, the customer uploads their signing
# credentials via the InfraReady dashboard or AWS Console.
# We do NOT store credentials in Terraform state — ever.

resource "aws_secretsmanager_secret" "apple_certificate" {
  name        = "${var.project_name}/mobile/apple-certificate"
  description = "Apple distribution certificate (.p12 file, base64-encoded). Fill after deploy."

  # Prevent accidental deletion — the signing cert is not easily recoverable
  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name    = "${local.name}-apple-cert"
    Purpose = "ios-signing"
  })
}

resource "aws_secretsmanager_secret_version" "apple_certificate" {
  secret_id     = aws_secretsmanager_secret.apple_certificate.id
  secret_string = "PLACEHOLDER — replace with your base64-encoded .p12 certificate"

  lifecycle {
    # Once the customer uploads their real credential, Terraform should not
    # overwrite it on subsequent applies.
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "apple_cert_password" {
  name        = "${var.project_name}/mobile/apple-cert-password"
  description = "Password for the Apple distribution certificate .p12 file."

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name    = "${local.name}-apple-cert-password"
    Purpose = "ios-signing"
  })
}

resource "aws_secretsmanager_secret_version" "apple_cert_password" {
  secret_id     = aws_secretsmanager_secret.apple_cert_password.id
  secret_string = "PLACEHOLDER — replace with your certificate password"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "android_keystore" {
  name        = "${var.project_name}/mobile/android-keystore"
  description = "Android release keystore (.jks file, base64-encoded). Fill after deploy."

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name    = "${local.name}-android-keystore"
    Purpose = "android-signing"
  })
}

resource "aws_secretsmanager_secret_version" "android_keystore" {
  secret_id     = aws_secretsmanager_secret.android_keystore.id
  secret_string = "PLACEHOLDER — replace with your base64-encoded .jks keystore"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "android_keystore_password" {
  name        = "${var.project_name}/mobile/android-keystore-password"
  description = "Password for the Android release keystore."

  recovery_window_in_days = 7

  tags = merge(local.common_tags, {
    Name    = "${local.name}-android-keystore-password"
    Purpose = "android-signing"
  })
}

resource "aws_secretsmanager_secret_version" "android_keystore_password" {
  secret_id     = aws_secretsmanager_secret.android_keystore_password.id
  secret_string = "PLACEHOLDER — replace with your keystore password"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ─── IAM ROLE FOR CODEBUILD ───────────────────────────────────────────────────

resource "aws_iam_role" "codebuild" {
  name = "${local.name}-codebuild-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "codebuild.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

# CloudWatch Logs — write build logs
resource "aws_iam_role_policy" "codebuild_logs" {
  name = "${local.name}-codebuild-logs-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          aws_cloudwatch_log_group.codebuild.arn,
          "${aws_cloudwatch_log_group.codebuild.arn}:*"
        ]
      }
    ]
  })
}

# S3 — read and write build artifacts
resource "aws_iam_role_policy" "codebuild_s3" {
  name = "${local.name}-codebuild-s3-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.artifacts.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetBucketAcl", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.artifacts.arn
      }
    ]
  })
}

# Secrets Manager — fetch signing credentials at build time
# Scoped to only the four secrets this module creates — no wildcard.
resource "aws_iam_role_policy" "codebuild_secrets" {
  name = "${local.name}-codebuild-secrets-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.apple_certificate.arn,
          aws_secretsmanager_secret.apple_cert_password.arn,
          aws_secretsmanager_secret.android_keystore.arn,
          aws_secretsmanager_secret.android_keystore_password.arn
        ]
      }
    ]
  })
}

# CodeBuild — allow the build to trigger itself for parallel platform builds
resource "aws_iam_role_policy" "codebuild_self_start" {
  name = "${local.name}-codebuild-self-start-policy"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["codebuild:StartBuild"]
        Resource = aws_codebuild_project.mobile.arn
      }
    ]
  })
}

# ─── CODEBUILD PROJECT ────────────────────────────────────────────────────────

resource "aws_codebuild_project" "mobile" {
  name          = "${local.name}-mobile-build"
  description   = "InfraReady mobile CI/CD pipeline — ${var.framework} for ${var.build_platform}"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = 60 # minutes — EAS cloud builds are fast; self-hosted Android ~30m

  source {
    type            = "GITHUB"
    location        = "https://github.com/${var.github_repo}.git"
    git_clone_depth = 1
    buildspec       = "buildspec.yml"

    git_submodules_config {
      fetch_submodules = false
    }
  }

  artifacts {
    type      = "S3"
    location  = aws_s3_bucket.artifacts.bucket
    packaging = "ZIP"
    name      = "mobile-build-artifacts"
  }

  environment {
    compute_type                = var.codebuild_compute_type
    image                       = var.codebuild_image
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = false # Only needed for Docker-in-Docker

    environment_variable {
      name  = "BUILD_PLATFORM"
      value = var.build_platform
      type  = "PLAINTEXT"
    }

    environment_variable {
      name  = "FRAMEWORK"
      value = var.framework
      type  = "PLAINTEXT"
    }

    environment_variable {
      name  = "BUNDLE_ID"
      value = var.bundle_id
      type  = "PLAINTEXT"
    }

    environment_variable {
      name  = "PACKAGE_NAME"
      value = var.package_name
      type  = "PLAINTEXT"
    }

    # ARNs injected as env vars so the buildspec can fetch credentials
    # without hardcoding ARNs in the YAML.
    environment_variable {
      name  = "APPLE_CERT_SECRET_ARN"
      value = aws_secretsmanager_secret.apple_certificate.arn
      type  = "PLAINTEXT"
    }

    environment_variable {
      name  = "APPLE_CERT_PASSWORD_SECRET_ARN"
      value = aws_secretsmanager_secret.apple_cert_password.arn
      type  = "PLAINTEXT"
    }

    environment_variable {
      name  = "ANDROID_KEYSTORE_SECRET_ARN"
      value = aws_secretsmanager_secret.android_keystore.arn
      type  = "PLAINTEXT"
    }

    environment_variable {
      name  = "ANDROID_KEYSTORE_PASSWORD_SECRET_ARN"
      value = aws_secretsmanager_secret.android_keystore_password.arn
      type  = "PLAINTEXT"
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.codebuild.name
      stream_name = "build"
      status      = "ENABLED"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-mobile-build"
  })
}

# ─── CODEBUILD WEBHOOK ────────────────────────────────────────────────────────
# Triggers a build on every push to the configured branch.
# Requires the GitHub OAuth connection to be established in CodeBuild
# (done once via the AWS Console on first use — not managed in Terraform to avoid
# storing the OAuth token in state).

resource "aws_codebuild_webhook" "github_push" {
  project_name  = aws_codebuild_project.mobile.name
  build_type    = "BUILD"

  filter_group {
    filter {
      type    = "EVENT"
      pattern = "PUSH"
    }

    filter {
      type    = "HEAD_REF"
      pattern = "^refs/heads/${var.github_branch}$"
    }
  }
}
