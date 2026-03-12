# ─── AWS BUDGETS — MONTHLY COST ALERTS ───────────────────────────────────────
# Creates a monthly cost budget with SNS notifications at 80% and 100% of threshold.
# Runs in the MANAGEMENT account (budgets are org-level resources).
#
# SOC2 CC9.2 — Risk mitigation: unexpected cost spikes can signal a security event
# (cryptomining, credential compromise) and must be alerted on.
#
# Usage: set var.monthly_budget_usd and var.budget_alert_email in tfvars.

# ─── SNS TOPIC FOR BUDGET ALERTS ─────────────────────────────────────────────
# AWS Budgets publishes to SNS when thresholds are breached.
# The SNS topic is created here; email subscription confirms via inbox.

resource "aws_sns_topic" "budget_alerts" {
  name = "${var.org_name}-budget-alerts"

  tags = merge(local.common_tags, {
    Name    = "${var.org_name}-budget-alerts"
    Purpose = "AWS cost budget threshold notifications"
  })
}

# Allow AWS Budgets service to publish to this topic
resource "aws_sns_topic_policy" "budget_alerts" {
  arn = aws_sns_topic.budget_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowBudgetsPublish"
        Effect = "Allow"
        Principal = {
          Service = "budgets.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.budget_alerts.arn
      }
    ]
  })
}

# Email subscription — recipient must confirm via the AWS confirmation email
resource "aws_sns_topic_subscription" "budget_email" {
  topic_arn = aws_sns_topic.budget_alerts.arn
  protocol  = "email"
  endpoint  = var.budget_alert_email
}

# ─── MONTHLY COST BUDGET ──────────────────────────────────────────────────────
# Tracks blended cost across all accounts in the organization.
# Two notification thresholds:
#   80% ACTUAL  — early warning; investigate immediately
#   100% ACTUAL — budget exceeded; escalate
#
# FORECASTED notifications are intentionally excluded — they generate false
# positives early in the month on low-traffic environments.

resource "aws_budgets_budget" "monthly" {
  name         = "${var.org_name}-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"

  # Reset to zero at the start of each calendar month
  time_unit = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.budget_alerts.arn]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.budget_alerts.arn]
  }
}
