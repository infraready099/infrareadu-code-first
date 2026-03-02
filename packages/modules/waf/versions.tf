terraform {
  required_version = ">= 1.8.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
      # WAF v2 for CloudFront must be in us-east-1
      configuration_aliases = [aws.us_east_1]
    }
  }
}
