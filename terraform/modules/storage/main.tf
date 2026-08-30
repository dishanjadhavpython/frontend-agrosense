/**
 * Where the data lives.
 *
 * The service currently writes to local disk — uploads, a pickled vector
 * store, agent reports as JSON. On Fargate that disappears on every deploy, so
 * the durable parts move here.
 *
 * The uploads bucket holds Soil Health Cards. A card carries a farmer's name,
 * village and survey number, so it gets: block-public-access on all four
 * settings, encryption at rest, versioning (an accidental overwrite of
 * somebody's record should be recoverable), TLS-only via bucket policy, and an
 * expiry. It is not a bucket anything is ever served from directly — the
 * service reads it and decides who may see what.
 */

resource "random_id" "suffix" {
  byte_length = 4
}

locals {
  # S3 bucket names are globally unique across every AWS account. A suffix is
  # not decoration; without it `terraform apply` fails for the second person
  # who tries this.
  uploads_bucket  = "${var.name_prefix}-uploads-${random_id.suffix.hex}"
  frontend_bucket = "${var.name_prefix}-frontend-${random_id.suffix.hex}"
}

# ---- Uploaded cards ------------------------------------------------------

resource "aws_s3_bucket" "uploads" {
  bucket = local.uploads_bucket
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket     = aws_s3_bucket.uploads.id
  depends_on = [aws_s3_bucket_versioning.uploads]

  rule {
    id     = "expire-cards"
    status = "Enabled"

    filter {
      prefix = "uploads/"
    }

    # The retention decision. See `card_retention_days` for why this is an
    # engineering default rather than a legal one.
    expiration {
      days = var.card_retention_days
    }

    # Versioning means an expired object leaves a delete marker and a
    # non-current version behind. Without these two rules the bucket grows
    # forever and the expiry above is theatre.
    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# A farmer's land record must not travel over plain HTTP, whatever the client
# asks for. Enforced at the bucket rather than trusted to every caller.
resource "aws_s3_bucket_policy" "uploads_tls_only" {
  bucket = aws_s3_bucket.uploads.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.uploads.arn,
        "${aws_s3_bucket.uploads.arn}/*",
      ]
      Condition = {
        Bool = { "aws:SecureTransport" = "false" }
      }
    }]
  })
}

# ---- The Next.js static assets ------------------------------------------

resource "aws_s3_bucket" "frontend" {
  bucket = local.frontend_bucket
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  # Also fully blocked. CloudFront reaches it through Origin Access Control,
  # not through a public bucket — a public S3 website endpoint would bypass
  # the WAF entirely.
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ---- DynamoDB ------------------------------------------------------------
#
# On-demand billing throughout. This is a bursty, low-volume workload — a
# prediction writes a handful of items — and provisioned capacity would be
# money spent on an idle table.

resource "aws_dynamodb_table" "documents" {
  name         = "${var.name_prefix}-documents"
  billing_mode = "PAY_PER_REQUEST"

  # Partitioned by owner, so "this farmer's cards" is a Query rather than a
  # Scan. That is not a performance nicety: the previous filesystem
  # implementation listed every card and filtered in Python, which is how the
  # unscoped version came to exist in the first place.
  hash_key  = "owner_id"
  range_key = "document_id"

  attribute {
    name = "owner_id"
    type = "S"
  }
  attribute {
    name = "document_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "reports" {
  name         = "${var.name_prefix}-reports"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "topic"

  attribute {
    name = "topic"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "ratelimit" {
  name         = "${var.name_prefix}-ratelimit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  # The counters delete themselves. A rate limiter needs no sweeper and no
  # storage bill beyond the window it is counting.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}
