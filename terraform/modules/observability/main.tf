/**
 * The alarms worth having, and a budget.
 *
 * Deliberately few. An alarm nobody acts on trains people to ignore alarms, so
 * each of these corresponds to something that has actually gone wrong in this
 * project or would obviously cost money:
 *
 *   no healthy task     the reading service is down; every card upload fails
 *   5xx from the ALB    it is up and erroring, which looks fine from outside
 *   agent errors        the failure that started all this — six topics in a
 *                       row returning credit_balance_exhausted while every
 *                       page politely said "not researched yet"
 *   budget              the whole point of the rate limiting
 */

resource "aws_sns_topic" "alerts" {
  count = var.alert_email == "" ? 0 : 1
  name  = "${var.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alarm_actions = var.alert_email == "" ? [] : [aws_sns_topic.alerts[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "no_healthy_tasks" {
  alarm_name          = "${var.name_prefix}-no-healthy-tasks"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Average"
  threshold           = 1
  alarm_description   = "The reading service has no healthy task. Every card upload and prediction is failing."

  dimensions = {
    TargetGroup  = var.target_group_suffix
    LoadBalancer = var.load_balancer_suffix
  }

  # Missing data here means the target group has no targets at all, which is
  # the condition being alarmed on rather than an absence of information.
  treat_missing_data = "breaching"
  alarm_actions      = local.alarm_actions
  ok_actions         = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "server_errors" {
  alarm_name          = "${var.name_prefix}-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "The service is up and returning errors, which looks healthy from outside."

  dimensions = {
    LoadBalancer = var.load_balancer_suffix
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "agent_failures" {
  alarm_name          = "${var.name_prefix}-agent-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 3600
  statistic           = "Sum"
  threshold           = 2
  alarm_description   = "The research sweep is failing. Usually the LLM key: expired, revoked, or out of credit."

  dimensions = {
    FunctionName = var.agents_function_name
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = local.alarm_actions
}

# ---- The bill ------------------------------------------------------------
#
# The reason the rate limiting exists. An alert at 80% is a warning; at 100%
# it is a bill that has already happened, which is why both are set.
resource "aws_budgets_budget" "monthly" {
  count = var.alert_email == "" ? 0 : 1

  name         = "${var.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

# ---- Where CloudFront writes its logs ------------------------------------

resource "aws_s3_bucket" "logs" {
  bucket        = "${var.name_prefix}-logs-${var.suffix}"
  force_destroy = var.environment != "prod"
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    # CloudFront's log delivery writes with an ACL, which is refused outright
    # under the default BucketOwnerEnforced.
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire"
    status = "Enabled"

    filter {}

    # Access logs are for debugging a bad week, not for keeping. They also
    # carry IP addresses, which is another reason not to hoard them.
    expiration {
      days = 30
    }
  }
}
