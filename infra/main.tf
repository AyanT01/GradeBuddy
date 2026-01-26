# =============================================================================
# GradeBuddy Infrastructure - AWS S3 (Database on Neon)
# =============================================================================
# This Terraform configuration provisions S3 storage for the AI Grading Platform.
# Database is hosted on Neon (free tier) - configured separately.
# =============================================================================

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Provider Configuration
# -----------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "GradeBuddy"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------
variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "allowed_origins" {
  description = "Allowed CORS origins for S3 bucket"
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "file_expiration_days" {
  description = "Number of days before uploaded files expire"
  type        = number
  default     = 30
}

# -----------------------------------------------------------------------------
# Random Suffix for Globally Unique S3 Bucket Name
# -----------------------------------------------------------------------------
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# -----------------------------------------------------------------------------
# S3 Bucket for File Uploads
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "uploads" {
  bucket = "ai-grading-app-uploads-${random_id.bucket_suffix.hex}"

  tags = {
    Name = "GradeBuddy Uploads"
  }
}

# -----------------------------------------------------------------------------
# S3 Bucket Versioning (disabled for dev, enable for prod)
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = var.environment == "prod" ? "Enabled" : "Suspended"
  }
}

# -----------------------------------------------------------------------------
# S3 Bucket Server-Side Encryption
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# -----------------------------------------------------------------------------
# S3 Bucket Public Access Block (Security Best Practice)
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# S3 Bucket CORS Configuration
# Allows direct browser uploads from the frontend
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# -----------------------------------------------------------------------------
# S3 Bucket Lifecycle Rule
# Automatically expires files after specified days to save costs during dev
# -----------------------------------------------------------------------------
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-old-uploads"
    status = "Enabled"

    filter {
      prefix = "submissions/"
    }

    expiration {
      days = var.file_expiration_days
    }

    # Clean up incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-temp-files"
    status = "Enabled"

    filter {
      prefix = "temp/"
    }

    expiration {
      days = 1
    }
  }
}

# -----------------------------------------------------------------------------
# IAM User for Backend Application (for S3 access)
# -----------------------------------------------------------------------------
resource "aws_iam_user" "app_user" {
  name = "gradebuddy-app-${var.environment}"
  path = "/gradebuddy/"

  tags = {
    Name = "GradeBuddy Application User"
  }
}

resource "aws_iam_access_key" "app_user" {
  user = aws_iam_user.app_user.name
}

# -----------------------------------------------------------------------------
# IAM Policy for S3 Access
# -----------------------------------------------------------------------------
resource "aws_iam_user_policy" "app_s3_policy" {
  name = "gradebuddy-s3-access"
  user = aws_iam_user.app_user.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3BucketAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetObjectAttributes"
        ]
        Resource = [
          aws_s3_bucket.uploads.arn,
          "${aws_s3_bucket.uploads.arn}/*"
        ]
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------
output "bucket_name" {
  description = "Name of the S3 bucket for uploads"
  value       = aws_s3_bucket.uploads.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.uploads.arn
}

output "bucket_region" {
  description = "Region of the S3 bucket"
  value       = var.aws_region
}

output "aws_access_key_id" {
  description = "AWS Access Key ID for the application"
  value       = aws_iam_access_key.app_user.id
  sensitive   = true
}

output "aws_secret_access_key" {
  description = "AWS Secret Access Key for the application"
  value       = aws_iam_access_key.app_user.secret
  sensitive   = true
}
