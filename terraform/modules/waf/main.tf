/**
 * The edge. Volumetric defence, in front of everything.
 *
 * This is the first of two rate-limiting layers and it counts per IP. The
 * second — a daily quota per Clerk user, in `backend/ratelimit.py` — is the
 * one that actually protects the OpenAI bill, because the expensive path is
 * per account and a signed-in user on a mobile network changes address every
 * few minutes.
 *
 * The numbers here are deliberately loose for that reason, plus one more:
 * several farmers in one village share a CGNAT address, so a tight per-IP rule
 * blocks the village and not the abuser. What this layer is for is stopping a
 * flood before it reaches any compute at all.
 *
 * us-east-1 because a CLOUDFRONT-scoped web ACL can only live there.
 */

resource "aws_wafv2_web_acl" "main" {
  provider = aws.us_east_1

  name  = "${var.name_prefix}-web-acl"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # ---- 1. Known-bad IPs, from AWS's own reputation list ------------------
  rule {
    name     = "ip-reputation"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # ---- 2. The common rule set -------------------------------------------
  rule {
    name     = "common"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"

        # A Soil Health Card is up to 10 MB and arrives as a multipart POST.
        # This rule caps a request body at 8 KB and would reject every single
        # upload — the app's own limit is enforced in three places already
        # (browser, route handler, and MAX_UPLOAD_BYTES), so this one is
        # removed rather than worked around.
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            allow {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = true
    }
  }

  # ---- 3. Site-wide flood control ---------------------------------------
  rule {
    name     = "rate-site"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5min
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-site"
      sampled_requests_enabled   = true
    }
  }

  # ---- 4. Tighter, on the paths that cost money -------------------------
  #
  # /api/card runs OCR and /api/predict starts research agents against a paid
  # key. Those deserve a lower ceiling than reading a crop page.
  rule {
    name     = "rate-api"
    priority = 4

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.api_rate_limit_per_5min
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            positional_constraint = "STARTS_WITH"
            search_string         = "/api/"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-api"
      sampled_requests_enabled   = true
    }
  }

  # ---- 5. Bot Control, optional -----------------------------------------
  #
  # Roughly $10/month plus per-request charges — the largest optional line in
  # this stack, which is why it is off by default rather than quietly on.
  dynamic "rule" {
    for_each = var.bot_control ? [1] : []

    content {
      name     = "bot-control"
      priority = 5

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = "AWSManagedRulesBotControlRuleSet"

          managed_rule_group_configs {
            aws_managed_rules_bot_control_rule_set {
              inspection_level = "COMMON"
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "bot-control"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-web-acl"
    sampled_requests_enabled   = true
  }
}
