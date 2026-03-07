locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "app-runner"
  })
}

# ─── ECR REPOSITORY ──────────────────────────────────────────────────────────

resource "aws_ecr_repository" "app" {
  name                 = "${local.name}-app"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-ecr"
  })
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}

# ─── IAM ROLE — ECR ACCESS (for App Runner build) ────────────────────────────
# Allows App Runner to pull images from your ECR repository

resource "aws_iam_role" "ecr_access" {
  name = "${local.name}-apprunner-ecr-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecr_access" {
  role       = aws_iam_role.ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ─── IAM ROLE — INSTANCE (what the running app can do) ───────────────────────

resource "aws_iam_role" "instance" {
  name = "${local.name}-apprunner-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "instance" {
  name = "${local.name}-apprunner-instance-policy"
  role = aws_iam_role.instance.id

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
        Resource = "*"
      },
      # Allow reading Secrets Manager secrets if secret ARNs are provided
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = length(var.secret_arns) > 0 ? var.secret_arns : ["arn:aws:secretsmanager:*:*:secret:infraready/*"]
        Condition = length(var.secret_arns) > 0 ? {} : {
          StringLike = { "secretsmanager:SecretId" = "infraready/*" }
        }
      }
    ]
  })
}

# ─── CLOUDWATCH LOG GROUP ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "app" {
  name              = "/infraready/${local.name}/app-runner"
  retention_in_days = var.log_retention_days

  tags = local.common_tags
}

# ─── AUTO-SCALING CONFIGURATION ──────────────────────────────────────────────
# min_size = 0 enables scale-to-zero (cold starts ~5-10s)
# min_size = 1 keeps one instance warm (no cold starts, ~$5/mo extra)

resource "aws_apprunner_auto_scaling_configuration_version" "app" {
  auto_scaling_configuration_name = "${local.name}-scaling"

  min_size        = var.min_concurrency
  max_size        = var.max_concurrency
  max_concurrency = 100 # requests per instance before scaling out

  tags = local.common_tags
}

# ─── APP RUNNER SERVICE ───────────────────────────────────────────────────────

resource "aws_apprunner_service" "app" {
  service_name = local.name

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.ecr_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.app.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = tostring(var.container_port)

        runtime_environment_variables = merge(
          {
            NODE_ENV = var.environment
            PORT     = tostring(var.container_port)
          },
          var.environment_variables
        )

        runtime_environment_secrets = {
          for k, v in var.secret_env_vars : k => v
        }
      }
    }

    auto_deployments_enabled = var.auto_deploy
  }

  instance_configuration {
    cpu               = var.cpu
    memory            = var.memory
    instance_role_arn = aws_iam_role.instance.arn
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.app.arn

  health_check_configuration {
    protocol            = "HTTP"
    path                = var.health_check_path
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-apprunner"
  })

  depends_on = [aws_iam_role_policy_attachment.ecr_access]
}
