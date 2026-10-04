/**
 * Account-level security: encryption, audit, threat detection, and a guardrail
 * on the one feature that takes free text from the public — the farmer chat.
 *
 *   KMS            one customer-managed key, rotated yearly, for the secrets
 *                  and the audit trail
 *   CloudTrail     every API call in every region, in a locked-down bucket,
 *                  with digest files so tampering with the record is evident
 *   GuardDuty      threat detection on the account, S3 data events and Lambda
 *                  network activity (ECS runtime monitoring optional)
 *   Access Analyzer   flags anything shared outside the account
 *   Bedrock Guardrail content filters, prompt-attack detection and PII masking
 *                  on the chat, enforced by Bedrock rather than by a prompt
 *   Security Hub / Inspector   optional — they bill per finding/scan, so they
 *                  are switched on by variable rather than by default
 */

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  trail_name = "${var.name_prefix}-trail"
  trail_arn  = "arn:${data.aws_partition.current.partition}:cloudtrail:${var.region}:${local.account_id}:trail/${local.trail_name}"
}

# ---- KMS ------------------------------------------------------------------

resource "aws_kms_key" "main" {
  description             = "${var.name_prefix}: secrets and audit trail"
  enable_key_rotation     = true
  deletion_window_in_days = var.environment == "prod" ? 30 : 7

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # The account administers the key, and IAM policies decide who uses it
        # (e.g. the ECS execution role's kms:Decrypt via Secrets Manager).
        Sid       = "AccountAdministers"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${local.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudTrailEncryptsItsLogs"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = ["kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceArn" = local.trail_arn }
          StringLike = {
            "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:${data.aws_partition.current.partition}:cloudtrail:*:${local.account_id}:trail/*"
          }
        }
      },
    ]
  })
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.name_prefix}"
  target_key_id = aws_kms_key.main.key_id
}

# ---- CloudTrail -----------------------------------------------------------

resource "aws_s3_bucket" "trail" {
  bucket        = "${var.name_prefix}-trail-${var.suffix}"
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_public_access_block" "trail" {
  bucket                  = aws_s3_bucket.trail.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "trail" {
  bucket = aws_s3_bucket.trail.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "trail" {
  bucket     = aws_s3_bucket.trail.id
  depends_on = [aws_s3_bucket_versioning.trail]

  rule {
    id     = "expire-audit-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.trail_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_s3_bucket_policy" "trail" {
  bucket = aws_s3_bucket.trail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.trail.arn
        Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
      },
      {
        Sid       = "CloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.trail.arn}/AWSLogs/${local.account_id}/*"
        Condition = {
          StringEquals = {
            "aws:SourceArn" = local.trail_arn
            "s3:x-amz-acl"  = "bucket-owner-full-control"
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.trail.arn, "${aws_s3_bucket.trail.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_cloudtrail" "main" {
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.trail.id
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.main.arn

  depends_on = [aws_s3_bucket_policy.trail]
}

# ---- GuardDuty ------------------------------------------------------------

resource "aws_guardduty_detector" "main" {
  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
}

resource "aws_guardduty_detector_feature" "s3" {
  detector_id = aws_guardduty_detector.main.id
  name        = "S3_DATA_EVENTS"
  status      = "ENABLED"
}

resource "aws_guardduty_detector_feature" "lambda" {
  detector_id = aws_guardduty_detector.main.id
  name        = "LAMBDA_NETWORK_LOGS"
  status      = "ENABLED"
}

# Watches what runs *inside* the Fargate tasks (process and network activity).
# Billed per vCPU-hour monitored, so a variable rather than a default.
resource "aws_guardduty_detector_feature" "runtime" {
  detector_id = aws_guardduty_detector.main.id
  name        = "RUNTIME_MONITORING"
  status      = var.guardduty_runtime_monitoring ? "ENABLED" : "DISABLED"

  additional_configuration {
    name   = "ECS_FARGATE_AGENT_MANAGEMENT"
    status = var.guardduty_runtime_monitoring ? "ENABLED" : "DISABLED"
  }
}

# ---- IAM Access Analyzer --------------------------------------------------

resource "aws_accessanalyzer_analyzer" "account" {
  analyzer_name = "${var.name_prefix}-access"
  type          = "ACCOUNT"
}

# ---- Optional: Security Hub, Inspector ------------------------------------

resource "aws_securityhub_account" "main" {
  count = var.enable_security_hub ? 1 : 0
}

resource "aws_securityhub_standards_subscription" "fsbp" {
  count         = var.enable_security_hub ? 1 : 0
  standards_arn = "arn:${data.aws_partition.current.partition}:securityhub:${var.region}::standards/aws-foundational-security-best-practices/v/1.0.0"
  depends_on    = [aws_securityhub_account.main]
}

# Scans the container images and the Lambda image for known CVEs, continuously.
resource "aws_inspector2_enabler" "main" {
  count          = var.enable_inspector ? 1 : 0
  account_ids    = [local.account_id]
  resource_types = ["ECR", "LAMBDA"]
}

# ---- Bedrock Guardrail for the farmer chat --------------------------------
#
# The system prompt asks the model to stay on farming and not to invent; this
# is the part that does not depend on the model agreeing. Filter strengths are
# set for a farming audience: "kill the pests", "rat poison" and "spray before
# rain" are ordinary sentences here, so VIOLENCE and MISCONDUCT sit at LOW
# rather than tripping on agronomy.

resource "aws_bedrock_guardrail" "chat" {
  name        = "${var.name_prefix}-chat"
  description = "AgroSense farmer chat: content filters, prompt-attack detection, PII masking."

  blocked_input_messaging   = "या प्रश्नाचं उत्तर देता येणार नाही — शेतीविषयी विचारा. / I can't help with that — please ask about your farm."
  blocked_outputs_messaging = "हे उत्तर देता येणार नाही — शेतीविषयी दुसरं काही विचारा. / I can't answer that — ask me something else about your farm."

  content_policy_config {
    filters_config {
      type            = "HATE"
      input_strength  = "MEDIUM"
      output_strength = "MEDIUM"
    }
    filters_config {
      type            = "INSULTS"
      input_strength  = "MEDIUM"
      output_strength = "MEDIUM"
    }
    filters_config {
      type            = "SEXUAL"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "VIOLENCE"
      input_strength  = "LOW"
      output_strength = "LOW"
    }
    filters_config {
      type            = "MISCONDUCT"
      input_strength  = "LOW"
      output_strength = "LOW"
    }
    # Detected on input only — Bedrock requires output strength NONE for it.
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = "HIGH"
      output_strength = "NONE"
    }
  }

  sensitive_information_policy_config {
    # Credentials have no place in a farming conversation, in either direction.
    pii_entities_config {
      type   = "AWS_ACCESS_KEY"
      action = "BLOCK"
    }
    pii_entities_config {
      type   = "AWS_SECRET_KEY"
      action = "BLOCK"
    }
    pii_entities_config {
      type   = "CREDIT_DEBIT_CARD_NUMBER"
      action = "BLOCK"
    }
    pii_entities_config {
      type   = "PASSWORD"
      action = "BLOCK"
    }
    # A farmer copying details off a scheme form may paste an Aadhaar number.
    # It is masked before the model sees it and never echoed back.
    regexes_config {
      name        = "aadhaar"
      description = "12-digit Aadhaar number, optionally grouped 4-4-4"
      pattern     = "\\b[2-9][0-9]{3}[ -]?[0-9]{4}[ -]?[0-9]{4}\\b"
      action      = "ANONYMIZE"
    }
  }

  word_policy_config {
    managed_word_lists_config {
      type = "PROFANITY"
    }
  }
}

# A published, immutable version for the service to pin — editing the DRAFT
# in the console then cannot change production behaviour unannounced.
resource "aws_bedrock_guardrail_version" "chat" {
  guardrail_arn = aws_bedrock_guardrail.chat.guardrail_arn
  description   = "Managed by Terraform"
}
