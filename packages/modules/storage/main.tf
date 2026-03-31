# ACM certificates for CloudFront must be in us-east-1 regardless of the deployment region.
# This alias is instantiated here so the module works as a standalone root module.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "infraready"
    Module      = "storage"
  })
}

data "aws_caller_identity" "current" {}

# ─── S3 BUCKET ───────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "app" {
  bucket = "${local.name}-storage-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.common_tags, {
    Name = "${local.name}-storage"
  })

  lifecycle {
    ignore_changes = [tags]
  }
}

resource "aws_s3_bucket_versioning" "app" {
  bucket = aws_s3_bucket.app.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "app" {
  bucket = aws_s3_bucket.app.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "app" {
  bucket = aws_s3_bucket.app.id

  # Block ALL public access — only CloudFront can access this bucket
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "app" {
  bucket = aws_s3_bucket.app.id

  rule {
    id     = "delete-old-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_logging" "app" {
  count = var.enable_access_logging ? 1 : 0

  bucket        = aws_s3_bucket.app.id
  target_bucket = aws_s3_bucket.logs[0].id
  target_prefix = "s3-access-logs/"
}

resource "aws_s3_bucket" "logs" {
  count         = var.enable_access_logging ? 1 : 0
  bucket        = "${local.name}-storage-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = local.common_tags
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  count  = var.enable_access_logging ? 1 : 0
  bucket = aws_s3_bucket.logs[0].id

  rule {
    id     = "expire-logs"
    status = "Enabled"
    filter {}
    expiration { days = 90 }
  }
}

# ─── CLOUDFRONT ORIGIN ACCESS CONTROL ────────────────────────────────────────
# Replaces legacy OAI — more secure, supports any S3 operation

resource "aws_cloudfront_origin_access_control" "app" {
  name                              = "${local.name}-oac"
  description                       = "OAC for ${local.name} S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ─── ACM CERTIFICATE ─────────────────────────────────────────────────────────
# Must be in us-east-1 for CloudFront

resource "aws_acm_certificate" "cdn" {
  count = var.cdn_domain != "" ? 1 : 0

  provider          = aws.us_east_1
  domain_name       = var.cdn_domain
  validation_method = "DNS"

  tags = merge(local.common_tags, {
    Name = "${local.name}-cdn-cert"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ─── CLOUDFRONT DISTRIBUTION ─────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "app" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  default_root_object = var.default_root_object
  price_class         = "PriceClass_100" # US, Canada, Europe (cheapest)
  wait_for_deployment = false

  origin {
    domain_name              = aws_s3_bucket.app.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.app.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.app.id
  }

  aliases = var.cdn_domain != "" ? [var.cdn_domain] : []

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.app.id}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    # Use managed cache policy for optimized caching
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
    origin_request_policy_id   = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # CORS-S3Origin
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03" # SecurityHeadersPolicy
  }

  # Cache behavior for static assets with long TTL
  ordered_cache_behavior {
    path_pattern           = "/static/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.app.id}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.cdn_domain != "" ? aws_acm_certificate.cdn[0].arn : null
    cloudfront_default_certificate = var.cdn_domain == ""
    ssl_support_method       = var.cdn_domain != "" ? "sni-only" : null
    minimum_protocol_version = var.cdn_domain != "" ? "TLSv1.2_2021" : null
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html" # SPA fallback
    error_caching_min_ttl = 10
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-cdn"
  })
}

# ─── S3 BUCKET POLICY — ONLY CLOUDFRONT CAN READ ─────────────────────────────

resource "aws_s3_bucket_policy" "app" {
  bucket = aws_s3_bucket.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.app.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.app.arn
          }
        }
      },
      {
        Sid    = "DenyInsecureTransport"
        Effect = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.app.arn,
          "${aws_s3_bucket.app.arn}/*"
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      }
    ]
  })
}
