/**
 * The edge: one CloudFront distribution, with the WAF on it, in front of the
 * load balancer.
 *
 * One origin. The web app serves its own pages, its API routes and its static
 * files, so there is no S3 asset bucket to keep in step with a build and no
 * second path for traffic to take around the WAF. TLS terminates here; the hop
 * to the load balancer is plain HTTP inside AWS, admitted only from CloudFront's
 * published address range *and* only with the origin header below, which the
 * listener checks before forwarding anything.
 */

locals {
  # AWS managed policies, by their published ids.
  caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  custom_domain     = var.domain_name != "" && var.acm_certificate_arn != ""
}

# What reaches the web app. The viewer's Host goes through — the hop is plain
# HTTP, so there is no origin certificate for it to break — because Clerk builds
# its sign-in redirects from Host: without it they point at the load balancer,
# which refuses anything without the origin header. CloudFront-Forwarded-Proto
# tells the app the viewer used HTTPS, which the load balancer's own
# X-Forwarded-Proto (always "http" on this hop) cannot. See src/middleware.ts.
resource "aws_cloudfront_origin_request_policy" "web" {
  name    = "${var.name_prefix}-web"
  comment = "All viewer headers, cookies and query strings, plus CloudFront-Forwarded-Proto"

  headers_config {
    header_behavior = "allViewerAndWhitelistCloudFront"
    headers {
      items = ["CloudFront-Forwarded-Proto"]
    }
  }
  cookies_config {
    cookie_behavior = "all"
  }
  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "${var.name_prefix} — AgroSense"
  # PriceClass_200 includes the Indian edge locations; _100 does not.
  price_class = var.price_class
  web_acl_id  = var.web_acl_arn
  aliases     = local.custom_domain ? [var.domain_name] : []

  origin {
    origin_id   = "alb"
    domain_name = var.alb_dns_name

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # Matches the load balancer's idle timeout: a streamed chat answer and a
      # slow card read must not be cut off at CloudFront's 30 s default.
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }

    custom_header {
      name  = "X-AgroSense-Origin"
      value = var.origin_secret
    }
  }

  # Everything is dynamic and per user (Clerk session, the farmer's own card),
  # so nothing is cached and the viewer's cookies, query and headers go through.
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = local.caching_disabled
    origin_request_policy_id = aws_cloudfront_origin_request_policy.web.id
  }

  # Next's build output is content-hashed, so it is safe to cache for a year.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = local.caching_optimized
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = !local.custom_domain
    acm_certificate_arn            = local.custom_domain ? var.acm_certificate_arn : null
    ssl_support_method             = local.custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.custom_domain ? "TLSv1.2_2021" : null
  }

  logging_config {
    bucket          = var.log_bucket_domain
    prefix          = "cloudfront/"
    include_cookies = false
  }
}
