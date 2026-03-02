# ─── WAF v2 MODULE ────────────────────────────────────────────────────────────
# SOC2 CC6.6 — Logical access controls to protect against external threats
# Covers: SQLi, XSS, rate limiting, known bad inputs, IP reputation lists

locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "waf"
  })
}

# ─── WAF WEB ACL ─────────────────────────────────────────────────────────────

resource "aws_wafv2_web_acl" "this" {
  name        = "${local.name}-waf"
  description = "WAF for ${local.name} — SQLi, XSS, rate limit, IP reputation"
  scope       = var.scope

  default_action {
    allow {}
  }

  # Rule 1: AWS IP Reputation List (bots, scanners, known bad actors)
  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: Rate limiting — prevent brute force, DDoS
  rule {
    name     = "RateLimitPerIP"
    priority = 20

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5min
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: SQL Injection (AWS Managed)
  dynamic "rule" {
    for_each = var.block_sql_injection ? [1] : []
    content {
      name     = "AWSManagedRulesSQLiRuleSet"
      priority = 30

      override_action {
      none {}
    }

      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesSQLiRuleSet"
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-sqli"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rule 4: XSS (AWS Managed Common Rule Set)
  dynamic "rule" {
    for_each = var.block_xss ? [1] : []
    content {
      name     = "AWSManagedRulesCommonRuleSet"
      priority = 40

      override_action {
      none {}
    }

      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesCommonRuleSet"
          vendor_name = "AWS"

          # Exclude body size rule — breaks file uploads
          rule_action_override {
            name          = "SizeRestrictions_BODY"
            action_to_use {
              count {}
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-common-rules"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rule 5: Known Bad Inputs (Log4j, Spring4Shell, etc)
  dynamic "rule" {
    for_each = var.block_known_bad_inputs ? [1] : []
    content {
      name     = "AWSManagedRulesKnownBadInputsRuleSet"
      priority = 50

      override_action {
      none {}
    }

      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesKnownBadInputsRuleSet"
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-known-bad-inputs"
        sampled_requests_enabled   = true
      }
    }
  }

  # Rule 6: Geo-blocking (optional)
  dynamic "rule" {
    for_each = length(var.allowed_countries) > 0 ? [1] : []
    content {
      name     = "GeoBlock"
      priority = 5

      action {
        block {}
      }

      statement {
        not_statement {
          statement {
            geo_match_statement {
              country_codes = var.allowed_countries
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-geo-block"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-waf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

# ─── WAF LOGGING ─────────────────────────────────────────────────────────────
# SOC2 CC7.2 — Log all blocked requests for incident investigation

resource "aws_cloudwatch_log_group" "waf" {
  # WAF log group MUST be named aws-waf-logs-*
  name              = "aws-waf-logs-${local.name}"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.this.arn

  # Redact sensitive headers — each redacted_fields block allows only one field type
  redacted_fields {
    single_header { name = "authorization" }
  }
  redacted_fields {
    single_header { name = "cookie" }
  }
}

# ─── ASSOCIATE WITH ALB (REGIONAL only) ─────────────────────────────────────

resource "aws_wafv2_web_acl_association" "alb" {
  count        = var.scope == "REGIONAL" && var.alb_arn != "" ? 1 : 0
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}

# ─── CLOUDWATCH ALARMS ────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "blocked_requests" {
  alarm_name          = "${local.name}-waf-high-block-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 1000
  alarm_description   = "High WAF block rate — possible attack in progress"

  dimensions = {
    WebACL = aws_wafv2_web_acl.this.name
    Region = "us-east-1"
    Rule   = "ALL"
  }

  tags = local.common_tags
}
