variable "project_name" {
  description = "Name of the project. Used as a prefix for all resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)."
  type        = string
  default     = "production"
}

variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "github_repo" {
  description = "GitHub repository in owner/repo format (e.g. acme/my-app). CodeBuild uses this as the source."
  type        = string
}

variable "github_branch" {
  description = "Branch that triggers builds on push."
  type        = string
  default     = "main"
}

variable "build_platform" {
  description = "Mobile platform to build. One of: ios | android | both."
  type        = string
  default     = "both"

  validation {
    condition     = contains(["ios", "android", "both"], var.build_platform)
    error_message = "build_platform must be one of: ios, android, both."
  }
}

variable "bundle_id" {
  description = "iOS bundle identifier (e.g. com.example.app). Injected as BUNDLE_ID env var into the build."
  type        = string
  default     = ""
}

variable "package_name" {
  description = "Android package name (e.g. com.example.app). Injected as PACKAGE_NAME env var into the build."
  type        = string
  default     = ""
}

variable "framework" {
  description = "Mobile framework. One of: expo | react-native | flutter."
  type        = string
  default     = "expo"

  validation {
    condition     = contains(["expo", "react-native", "flutter"], var.framework)
    error_message = "framework must be one of: expo, react-native, flutter."
  }
}

variable "codebuild_compute_type" {
  description = "CodeBuild compute type. BUILD_GENERAL1_MEDIUM (3 GB RAM) is sufficient for most mobile builds."
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"
}

variable "codebuild_image" {
  description = "CodeBuild managed image. Default is the latest standard Linux image with Node, Java, and Android SDKs."
  type        = string
  default     = "aws/codebuild/standard:7.0"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days for CodeBuild logs."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags to apply to all resources."
  type        = map(string)
  default     = {}
}
