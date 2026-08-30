/**
 * CloudFront, and the two origins behind it.
 *
 * One distribution, three behaviours:
 *
 *   /_next/static/*   S3, cached hard — content-hashed filenames, so a year
 *   /api/py/*         the ALB, never cached — every one of these is a card
 *                     read, a prediction, or a farmer's own document
 *   everything else   the Next.js server
 *
 * The Next.js server origin is left as a variable rather than created here.
 * Deploying Next to Lambda is OpenNext's job — it builds the function bundle
 * and the asset manifest — and a Terraform module that tried to own that would
 * have to know about the build output. See terraform/README.md: run OpenNext,
 * then pass its function URL in.
 */

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.name_prefix}-s3-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# A shared secret on the origin request. CloudFront's own IP ranges already
# gate the ALB (network module), and this is the second half: even from inside
# those ranges, a request without the header is not ours.
resource "aws_cloudfront_origin_request_policy" "api" {
  name = "${var.name_prefix}-api"

  cookies_config {
    # Clerk's session cookie has to reach the backend for the JWT to be
    # verifiable there.
    cookie_behavior = "all"
  }
  headers_config {
    header_behavior = "allViewerAndWhitelistCloudFront"
    headers {
      items = ["CloudFront-Viewer-Country"]
    }
  }
  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_cache_policy" "none" {
  name        = "${var.name_prefix}-no-cache"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.name_prefix} — ${var.environment}"

  # India only. The audience is Maharashtra farmers; paying for edge locations
  # in South America and Australia would be paying for nobody.
  price_class = "PriceClass_200"

  web_acl_id = var.web_acl_arn

  # ---- Origins ----------------------------------------------------------

  origin {
    origin_id                = "s3-assets"
    domain_name              = var.frontend_bucket_regional_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.alb_dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-AgroSense-Key"
      value = var.origin_secret
    }
  }

  origin {
    origin_id   = "next"
    domain_name = var.next_origin_domain

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # ---- Behaviours -------------------------------------------------------

  # Everything not matched below: the Next.js server.
  default_cache_behavior {
    target_origin_id       = "next"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # CachingDisabled. Pages carry a Clerk session and a per-request CSP nonce;
    # caching them at the edge would serve one farmer's signed-in HTML — and
    # one farmer's nonce — to the next.
    cache_policy_id          = aws_cloudfront_cache_policy.none.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "s3-assets"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Managed-CachingOptimized. Filenames are content-hashed, so a year is
    # safe and a cache miss is the only thing that costs anything here.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  ordered_cache_behavior {
    path_pattern           = "/api/py/*"
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.none.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # The *.cloudfront.net certificate. Swap for an ACM cert in us-east-1 and
    # set `aliases` once there is a domain.
    cloudfront_default_certificate = true
  }

  logging_config {
    bucket          = var.log_bucket_domain
    prefix          = "cloudfront/"
    include_cookies = false
  }
}

# CloudFront reaches the asset bucket through OAC, which needs the bucket to
# name this distribution. The policy is written here because it is the
# distribution that closes the loop.
data "aws_iam_policy_document" "frontend_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${var.frontend_bucket_arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = var.frontend_bucket
  policy = data.aws_iam_policy_document.frontend_bucket.json
}
