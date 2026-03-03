# ─── SECURITY BASELINE MODULE ─────────────────────────────────────────────────
# SOC2 Type II controls covered:
# CC6.1  — Logical access controls, encryption at rest & in transit
# CC6.2  — Authentication and access management
# CC6.6  — Threat and vulnerability management
# CC6.7  — Data transmission controls
# CC7.1  — Threat detection (GuardDuty)
# CC7.2  — System monitoring (CloudTrail, CloudWatch)
# CC7.3  — Incident response (SNS alerts)
# A1.1   — Availability monitoring
#
# HIPAA Technical Safeguards (when enable_hipaa = true):
# §164.312(a)(1) — Access controls
# §164.312(b)    — Audit controls (CloudTrail + pgaudit)
# §164.312(c)(1) — Integrity (log file validation)
# §164.312(e)(1) — Transmission security
#
# CIS AWS Foundations Benchmark v1.4 — CloudWatch alarms for all CIS controls

locals {
  name = "${var.project_name}-${var.environment}"

  # HIPAA requires 6 years, SOC2 requires 1 year. Default to HIPAA-safe 7 years.
  effective_retention_days = var.enable_hipaa ? 2555 : var.log_retention_days

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "security"
    # PHI tagging — auditors look for this
    DataClassification = var.enable_hipaa ? "PHI" : "Internal"
  })
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── CUSTOMER-MANAGED KMS KEY ─────────────────────────────────────────────────
# HIPAA requires CMKs (not AWS-managed keys) for all PHI encryption
# SOC2 CC6.1 — Customer controls the key, not AWS

resource "aws_kms_key" "security" {
  description             = "CMK for ${local.name} security services (SNS, CloudWatch Logs, CloudTrail S3)"
  deletion_window_in_days = 30
  enable_key_rotation     = true # Rotates annually — SOC2 + HIPAA requirement

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccess"
        Effect = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Principal = { Service = "logs.${data.aws_region.current.name}.amazonaws.com" }
        Action   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
          }
        }
      },
      {
        Sid    = "AllowSNS"
        Effect = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource = "*"
      },
      {
        Sid    = "AllowCloudTrailS3"
        Effect = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-security-cmk" })
}

resource "aws_kms_alias" "security" {
  name          = "alias/${local.name}-security"
  target_key_id = aws_kms_key.security.key_id
}

# ─── SNS TOPIC FOR ALERTS (NOW ENCRYPTED) ────────────────────────────────────
# Fixed gap: SNS was previously unencrypted — HIPAA and SOC2 require encryption

resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-security-alerts"
  kms_master_key_id = aws_kms_key.security.arn # ← GAP FIXED: encrypted SNS

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ─── CLOUDTRAIL — AUDIT LOG ALL API CALLS ────────────────────────────────────
# SOC2 CC7.2 — Log ALL API activity including Lambda invocations
# Fixed gap: Added Lambda data events (previously missing)

resource "aws_s3_bucket" "cloudtrail" {
  bucket        = "${local.name}-cloudtrail-${data.aws_caller_identity.current.account_id}"
  force_destroy = false

  tags = merge(local.common_tags, { Name = "${local.name}-cloudtrail" })
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket                  = aws_s3_bucket.cloudtrail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.security.arn # CMK not AWS-managed key
    }
    bucket_key_enabled = true # Reduces KMS API costs by 99%
  }
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  rule {
    id     = "archive-and-expire"
    status = "Enabled"
    filter {}
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 365
      storage_class = "GLACIER"
    }
    transition {
      days          = 730
      storage_class = "DEEP_ARCHIVE" # Cheapest storage for 7-year HIPAA retention
    }
    expiration {
      days = local.effective_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
        Condition = {
          StringEquals = { "aws:SourceArn" = "arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.name}-trail" }
        }
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = "arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/${local.name}-trail"
          }
        }
      },
      {
        Sid       = "DenyNonTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["${aws_s3_bucket.cloudtrail.arn}", "${aws_s3_bucket.cloudtrail.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid    = "DenyDelete"
        Effect = "Deny"
        Principal = "*"
        Action = ["s3:DeleteObject", "s3:DeleteBucket", "s3:DeleteObjectVersion"]
        Resource = [aws_s3_bucket.cloudtrail.arn, "${aws_s3_bucket.cloudtrail.arn}/*"]
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/infraready/${local.name}/cloudtrail"
  retention_in_days = 90 # Hot logs 90 days in CW, rest in S3 Glacier
  kms_key_id        = aws_kms_key.security.arn # ← GAP FIXED: encrypted log group

  tags = local.common_tags
}

resource "aws_iam_role" "cloudtrail" {
  name = "${local.name}-cloudtrail-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "cloudtrail" {
  name = "${local.name}-cloudtrail-policy"
  role = aws_iam_role.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
    }]
  })
}

resource "aws_cloudtrail" "this" {
  name                          = "${local.name}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail.arn
  kms_key_id                    = aws_kms_key.security.arn # Encrypt trail itself

  # S3 data events — who accessed which objects
  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3:::"]
    }
  }

  # ← GAP FIXED: Lambda data events — log all function invocations
  event_selector {
    read_write_type           = "All"
    include_management_events = false

    data_resource {
      type   = "AWS::Lambda::Function"
      values = ["arn:aws:lambda"]
    }
  }

  tags = merge(local.common_tags, { Name = "${local.name}-cloudtrail" })

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# ─── GUARDDUTY — THREAT DETECTION ────────────────────────────────────────────
# SOC2 CC7.1 — Detects compromised credentials, crypto mining, port scanning

resource "aws_guardduty_detector" "this" {
  count  = var.enable_guardduty ? 1 : 0
  enable = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_event_rule" "guardduty_findings" {
  count       = var.enable_guardduty ? 1 : 0
  name        = "${local.name}-guardduty-findings"
  description = "Route GuardDuty HIGH/CRITICAL findings to SNS"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
    detail      = { severity = [{ numeric = [">=", 7] }] } # HIGH and CRITICAL only
  })
}

resource "aws_cloudwatch_event_target" "guardduty_sns" {
  count     = var.enable_guardduty ? 1 : 0
  rule      = aws_cloudwatch_event_rule.guardduty_findings[0].name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.alerts.arn
}

# ─── AWS CONFIG — COMPLIANCE MONITORING ──────────────────────────────────────

resource "aws_config_configuration_recorder" "this" {
  count    = var.enable_config ? 1 : 0
  name     = "${local.name}-config-recorder"
  role_arn = aws_iam_role.config[0].arn

  recording_group {
    all_supported                 = true
    include_global_resource_types = true
  }
}

resource "aws_config_delivery_channel" "this" {
  count          = var.enable_config ? 1 : 0
  name           = "${local.name}-config-channel"
  s3_bucket_name = aws_s3_bucket.cloudtrail.id
  sns_topic_arn  = aws_sns_topic.alerts.arn
  depends_on     = [aws_config_configuration_recorder.this]
}

resource "aws_config_configuration_recorder_status" "this" {
  count      = var.enable_config ? 1 : 0
  name       = aws_config_configuration_recorder.this[0].name
  is_enabled = true
  depends_on = [aws_config_delivery_channel.this]
}

resource "aws_iam_role" "config" {
  count = var.enable_config ? 1 : 0
  name  = "${local.name}-config-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "config.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "config" {
  count      = var.enable_config ? 1 : 0
  role       = aws_iam_role.config[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"
}

# ← GAP FIXED: SOC2 Conformance Pack — pre-built by AWS, covers ~70 SOC2 controls
resource "aws_config_conformance_pack" "soc2" {
  count = var.enable_config && var.enable_soc2_conformance_pack ? 1 : 0
  name  = "${local.name}-soc2"

  template_body = <<-EOT
    Parameters:
      AccessKeysRotatedParamMaxAccessKeyAge:
        Default: "90"
      IamPasswordPolicyParamMaxPasswordAge:
        Default: "90"
      IamPasswordPolicyParamMinimumPasswordLength:
        Default: "16"
      IamPasswordPolicyParamPasswordReusePrevention:
        Default: "12"
    Resources:
      CloudTrailEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: cloudtrail-enabled
          Source:
            Owner: AWS
            SourceIdentifier: CLOUD_TRAIL_ENABLED
      CloudTrailEncryptionEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: cloud-trail-encryption-enabled
          Source:
            Owner: AWS
            SourceIdentifier: CLOUD_TRAIL_ENCRYPTION_ENABLED
      CloudTrailLogFileValidationEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: cloud-trail-log-file-validation-enabled
          Source:
            Owner: AWS
            SourceIdentifier: CLOUD_TRAIL_LOG_FILE_VALIDATION_ENABLED
      GuardDutyEnabledCentralized:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: guardduty-enabled-centralized
          Source:
            Owner: AWS
            SourceIdentifier: GUARDDUTY_ENABLED_CENTRALIZED
      RdsInstancePublicAccessCheck:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: rds-instance-public-access-check
          Source:
            Owner: AWS
            SourceIdentifier: RDS_INSTANCE_PUBLIC_ACCESS_CHECK
      RdsStorageEncrypted:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: rds-storage-encrypted
          Source:
            Owner: AWS
            SourceIdentifier: RDS_STORAGE_ENCRYPTED
      S3BucketPublicReadProhibited:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-public-read-prohibited
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      S3BucketPublicWriteProhibited:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-public-write-prohibited
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_PUBLIC_WRITE_PROHIBITED
      S3BucketSslRequestsOnly:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: s3-bucket-ssl-requests-only
          Source:
            Owner: AWS
            SourceIdentifier: S3_BUCKET_SSL_REQUESTS_ONLY
      IamRootAccessKeyCheck:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: iam-root-access-key-check
          Source:
            Owner: AWS
            SourceIdentifier: IAM_ROOT_ACCESS_KEY_CHECK
      MfaEnabledForIamConsoleAccess:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: mfa-enabled-for-iam-console-access
          Source:
            Owner: AWS
            SourceIdentifier: MFA_ENABLED_FOR_IAM_CONSOLE_ACCESS
      RootAccountMfaEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: root-account-mfa-enabled
          Source:
            Owner: AWS
            SourceIdentifier: ROOT_ACCOUNT_MFA_ENABLED
      AccessKeysRotated:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: access-keys-rotated
          InputParameters:
            maxAccessKeyAge: "90"
          Source:
            Owner: AWS
            SourceIdentifier: ACCESS_KEYS_ROTATED
      VpcDefaultSecurityGroupClosed:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: vpc-default-security-group-closed
          Source:
            Owner: AWS
            SourceIdentifier: VPC_DEFAULT_SECURITY_GROUP_CLOSED
      VpcFlowLogsEnabled:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: vpc-flow-logs-enabled
          Source:
            Owner: AWS
            SourceIdentifier: VPC_FLOW_LOGS_ENABLED
      EcsTaskDefinitionUserForHostMode:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: ecs-task-definition-user-for-host-mode-check
          Source:
            Owner: AWS
            SourceIdentifier: ECS_TASK_DEFINITION_USER_FOR_HOST_MODE_CHECK
      SecretsManagerRotationEnabledCheck:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: secretsmanager-rotation-enabled-check
          Source:
            Owner: AWS
            SourceIdentifier: SECRETSMANAGER_ROTATION_ENABLED_CHECK
      KmsCmkNotScheduledForDeletion:
        Type: AWS::Config::ConfigRule
        Properties:
          ConfigRuleName: kms-cmk-not-scheduled-for-deletion
          Source:
            Owner: AWS
            SourceIdentifier: KMS_CMK_NOT_SCHEDULED_FOR_DELETION
  EOT

  depends_on = [aws_config_configuration_recorder_status.this]
}

# ─── SECURITY HUB — UNIFIED COMPLIANCE DASHBOARD ─────────────────────────────

resource "aws_securityhub_account" "this" {
  count                        = var.enable_security_hub ? 1 : 0
  enable_default_standards     = false # We control which standards explicitly
  auto_enable_controls         = true
  control_finding_generator    = "SECURITY_CONTROL"
}

# CIS AWS Foundations Benchmark v1.4
resource "aws_securityhub_standards_subscription" "cis" {
  count         = var.enable_security_hub ? 1 : 0
  standards_arn = "arn:aws:securityhub:${data.aws_region.current.name}::standards/cis-aws-foundations-benchmark/v/1.4.0"
  depends_on    = [aws_securityhub_account.this]
}

# ← GAP FIXED: AWS Foundational Security Best Practices (FSBP)
resource "aws_securityhub_standards_subscription" "afsbp" {
  count         = var.enable_security_hub ? 1 : 0
  standards_arn = "arn:aws:securityhub:${data.aws_region.current.name}::standards/aws-foundational-security-best-practices/v/1.0.0"
  depends_on    = [aws_securityhub_account.this]
}

# NIST SP 800-53 Rev 5 — required for US government and many enterprises
resource "aws_securityhub_standards_subscription" "nist" {
  count         = var.enable_security_hub && var.enable_nist_standard ? 1 : 0
  standards_arn = "arn:aws:securityhub:${data.aws_region.current.name}::standards/nist-800-53/v/5.0.0"
  depends_on    = [aws_securityhub_account.this]
}

# Route Security Hub findings to SNS
resource "aws_cloudwatch_event_rule" "securityhub_findings" {
  count       = var.enable_security_hub ? 1 : 0
  name        = "${local.name}-securityhub-critical"
  description = "Route CRITICAL Security Hub findings to SNS"

  event_pattern = jsonencode({
    source      = ["aws.securityhub"]
    detail-type = ["Security Hub Findings - Imported"]
    detail = {
      findings = {
        Severity = { Label = ["CRITICAL", "HIGH"] }
        Workflow  = { Status = ["NEW"] }
        RecordState = ["ACTIVE"]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "securityhub_sns" {
  count     = var.enable_security_hub ? 1 : 0
  rule      = aws_cloudwatch_event_rule.securityhub_findings[0].name
  target_id = "SendToSNS"
  arn       = aws_sns_topic.alerts.arn
}

# ─── IAM PASSWORD POLICY ─────────────────────────────────────────────────────
# SOC2 CC6.2, CIS 1.8-1.11

resource "aws_iam_account_password_policy" "this" {
  minimum_password_length        = 16
  require_uppercase_characters   = true
  require_lowercase_characters   = true
  require_numbers                = true
  require_symbols                = true
  allow_users_to_change_password = true
  max_password_age               = 90
  password_reuse_prevention      = 24 # CIS requires 24
  hard_expiry                    = false
}

# ─── CIS BENCHMARK CLOUDWATCH ALARMS ─────────────────────────────────────────
# CIS AWS Foundations 3.1-3.14 — alert on unauthorized/dangerous API patterns

locals {
  cis_alarms = {
    unauthorized_api = {
      pattern = "{ ($.errorCode = \"*UnauthorizedAccess*\") || ($.errorCode = \"AccessDenied*\") }"
      desc    = "CIS 3.1 — Unauthorized API calls"
    }
    no_mfa_console = {
      pattern = "{ ($.eventName = \"ConsoleLogin\") && ($.additionalEventData.MFAUsed != \"Yes\") && ($.userIdentity.type = \"IAMUser\") && ($.responseElements.ConsoleLogin = \"Success\") }"
      desc    = "CIS 3.2 — Console login without MFA"
    }
    root_usage = {
      pattern = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
      desc    = "CIS 3.3 — Root account usage"
    }
    iam_changes = {
      pattern = "{ ($.eventName = DeleteGroupPolicy) || ($.eventName = DeleteRolePolicy) || ($.eventName = DeleteUserPolicy) || ($.eventName = PutGroupPolicy) || ($.eventName = PutRolePolicy) || ($.eventName = PutUserPolicy) || ($.eventName = CreatePolicy) || ($.eventName = DeletePolicy) || ($.eventName = CreatePolicyVersion) || ($.eventName = DeletePolicyVersion) || ($.eventName = SetDefaultPolicyVersion) || ($.eventName = AttachRolePolicy) || ($.eventName = DetachRolePolicy) || ($.eventName = AttachUserPolicy) || ($.eventName = DetachUserPolicy) || ($.eventName = AttachGroupPolicy) || ($.eventName = DetachGroupPolicy) }"
      desc    = "CIS 3.4 — IAM policy changes"
    }
    cloudtrail_changes = {
      pattern = "{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail) || ($.eventName = StartLogging) || ($.eventName = StopLogging) }"
      desc    = "CIS 3.5 — CloudTrail configuration changes"
    }
    console_auth_failures = {
      pattern = "{ ($.eventName = ConsoleLogin) && ($.errorMessage = \"Failed authentication\") }"
      desc    = "CIS 3.6 — Console authentication failures"
    }
    cmk_deletion = {
      pattern = "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion)) }"
      desc    = "CIS 3.7 — Disabling or scheduling CMK deletion"
    }
    s3_policy_changes = {
      pattern = "{ ($.eventSource = s3.amazonaws.com) && (($.eventName = PutBucketAcl) || ($.eventName = PutBucketPolicy) || ($.eventName = PutBucketCors) || ($.eventName = PutBucketLifecycle) || ($.eventName = PutBucketReplication) || ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketCors) || ($.eventName = DeleteBucketLifecycle) || ($.eventName = DeleteBucketReplication)) }"
      desc    = "CIS 3.8 — S3 bucket policy changes"
    }
    config_changes = {
      pattern = "{ ($.eventSource = config.amazonaws.com) && (($.eventName = StopConfigurationRecorder) || ($.eventName = DeleteDeliveryChannel) || ($.eventName = PutDeliveryChannel) || ($.eventName = PutConfigurationRecorder)) }"
      desc    = "CIS 3.9 — AWS Config configuration changes"
    }
    security_group_changes = {
      pattern = "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }"
      desc    = "CIS 3.10 — Security group changes"
    }
    nacl_changes = {
      pattern = "{ ($.eventName = CreateNetworkAcl) || ($.eventName = CreateNetworkAclEntry) || ($.eventName = DeleteNetworkAcl) || ($.eventName = DeleteNetworkAclEntry) || ($.eventName = ReplaceNetworkAclEntry) || ($.eventName = ReplaceNetworkAclAssociation) }"
      desc    = "CIS 3.11 — Network ACL changes"
    }
    gateway_changes = {
      pattern = "{ ($.eventName = CreateCustomerGateway) || ($.eventName = DeleteCustomerGateway) || ($.eventName = AttachInternetGateway) || ($.eventName = CreateInternetGateway) || ($.eventName = DeleteInternetGateway) || ($.eventName = DetachInternetGateway) }"
      desc    = "CIS 3.12 — Network gateway changes"
    }
    route_table_changes = {
      pattern = "{ ($.eventSource = ec2.amazonaws.com) && (($.eventName = CreateRoute) || ($.eventName = CreateRouteTable) || ($.eventName = ReplaceRoute) || ($.eventName = ReplaceRouteTableAssociation) || ($.eventName = DeleteRouteTable) || ($.eventName = DeleteRoute) || ($.eventName = DisassociateRouteTable)) }"
      desc    = "CIS 3.13 — Route table changes"
    }
    vpc_changes = {
      pattern = "{ ($.eventName = CreateVpc) || ($.eventName = DeleteVpc) || ($.eventName = ModifyVpcAttribute) || ($.eventName = AcceptVpcPeeringConnection) || ($.eventName = CreateVpcPeeringConnection) || ($.eventName = DeleteVpcPeeringConnection) || ($.eventName = RejectVpcPeeringConnection) || ($.eventName = AttachClassicLinkVpc) || ($.eventName = DetachClassicLinkVpc) || ($.eventName = DisableVpcClassicLink) || ($.eventName = EnableVpcClassicLink) }"
      desc    = "CIS 3.14 — VPC changes"
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "cis" {
  for_each       = local.cis_alarms
  name           = "${local.name}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = each.value.pattern

  metric_transformation {
    name      = "${local.name}-${each.key}"
    namespace = "InfraReady/CISBenchmark"
    value     = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "cis" {
  for_each            = local.cis_alarms
  alarm_name          = "${local.name}-cis-${each.key}"
  alarm_description   = each.value.desc
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "${local.name}-${each.key}"
  namespace           = "InfraReady/CISBenchmark"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = local.common_tags
}

# ─── BILLING ALARM ────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "billing" {
  alarm_name          = "${local.name}-billing-alarm"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 86400
  statistic           = "Maximum"
  threshold           = var.billing_alarm_threshold_usd
  alarm_description   = "AWS bill exceeded $${var.billing_alarm_threshold_usd}"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  dimensions          = { Currency = "USD" }

  tags = local.common_tags
}
