/**
 * Once per AWS account: what the CI/CD pipeline needs before it can run.
 *
 *   tfstate        the main configuration's remote state (S3, native locking)
 *   build-inputs   files the images need that a public repository must not
 *                  carry: the trained models and the engine's data
 *   GitHub OIDC    lets the deploy workflow assume a role with a short-lived
 *                  token — there is no AWS access key anywhere in GitHub
 *
 * Applied by hand, once:
 *
 *   cd terraform/bootstrap
 *   terraform init && terraform apply
 *
 * Its own state then moves into the state bucket it created (see README.md).
 */

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
  backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform-bootstrap"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "project" {
  type    = string
  default = "agrosense"
}

variable "github_repository" {
  description = "owner/name of the repository whose deploy workflow may assume the role."
  type        = string
  default     = "dishanjadhavpython/frontend-agrosense"
}

variable "github_subject_prefix" {
  description = <<-EOT
    The repository part of GitHub's OIDC `sub` claim. This repository issues
    immutable subjects — owner and repository names with their numeric ids —
    so a renamed or re-created repository with the same name cannot assume
    the role. Read it with:
      gh api repos/OWNER/REPO/actions/oidc/customization/sub
  EOT
  type        = string
  default     = "repo:dishanjadhavpython@165149775/frontend-agrosense@1325676094"
}

variable "github_environment" {
  description = "The GitHub environment the deploy job runs in. Only that job can assume the role."
  type        = string
  default     = "dev"
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  buckets = {
    tfstate      = "${var.project}-tfstate-${local.account_id}"
    build_inputs = "${var.project}-build-inputs-${local.account_id}"
  }
}

# ---- Buckets --------------------------------------------------------------

resource "aws_s3_bucket" "this" {
  for_each = local.buckets
  bucket   = each.value

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  for_each   = aws_s3_bucket.this
  bucket     = each.value.id
  depends_on = [aws_s3_bucket_versioning.this]

  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "tls_only" {
  for_each = aws_s3_bucket.this
  bucket   = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [each.value.arn, "${each.value.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.this]
}

# ---- GitHub OIDC ----------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS validates GitHub's certificate against its own trust store; the
  # thumbprints are required by the API but no longer consulted for GitHub.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

# Assumable only by a job in this repository running in the named GitHub
# environment — not by a pull request, not by another branch's workflow, not
# by a fork. The environment is where approval rules can be added in GitHub.
resource "aws_iam_role" "github_deploy" {
  name                 = "${var.project}-github-deploy"
  description          = "Assumed by ${var.github_repository} (environment ${var.github_environment}) to deploy AgroSense."
  max_session_duration = 7200

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "${var.github_subject_prefix}:environment:${var.github_environment}"
        }
      }
    }]
  })
}

# Terraform creates IAM roles, KMS keys, CloudTrail, GuardDuty and the rest, so
# the role needs administrator rights; the trust policy above is what keeps it
# to one workflow in one environment of one repository.
resource "aws_iam_role_policy_attachment" "github_deploy_admin" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}

output "tfstate_bucket" {
  value = aws_s3_bucket.this["tfstate"].id
}

output "build_inputs_bucket" {
  value = aws_s3_bucket.this["build_inputs"].id
}
