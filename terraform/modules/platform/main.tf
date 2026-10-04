/**
 * What the three services share: the ECS cluster, the Service Connect
 * namespace they find each other through, the load balancer in front of the web
 * app, the execution role ECS starts tasks with, and the secrets.
 *
 * Only the web app is behind the load balancer. The reading service and the
 * recommendation engine are reached by the web app over Service Connect
 * (`http://api:8000`, `http://engine:8001`) and have no public route at all —
 * the browser never calls them directly, so nothing outside the VPC should be
 * able to.
 */

resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.environment == "prod" ? "enabled" : "disabled"
  }
}

# Service Connect needs a Cloud Map namespace; HTTP-only (no Route 53 zone)
# because nothing resolves these names except the Envoy sidecars ECS injects.
resource "aws_service_discovery_http_namespace" "main" {
  name        = "${var.name_prefix}.internal"
  description = "Service Connect namespace for the AgroSense services"
}

# ---- Secrets -------------------------------------------------------------
#
# Created empty. Terraform state is not a secret store — anything written into
# a resource argument is readable in plaintext in the state file — so values
# are set out of band:
#
#   aws secretsmanager put-secret-value --secret-id <arn> --secret-string '...'
#
# Encrypted with the project's customer-managed KMS key, so reading one needs
# both the Secrets Manager permission and kms:Decrypt on that key.

locals {
  # Required: injected by ECS, so a task without them refuses to start.
  required_secrets = ["clerk-secret-key", "agrosense-api-key"]
  # Optional: read at startup through the SDK (see backend/config.py), because
  # ECS will not start a task whose injected secret was never given a value.
  optional_secrets = ["youtube-api-key", "data-gov-in-api-key"]
}

resource "aws_secretsmanager_secret" "app" {
  for_each = toset(concat(local.required_secrets, local.optional_secrets))

  name                    = "${var.name_prefix}/${each.key}"
  description             = "Set with put-secret-value; never through Terraform."
  kms_key_id              = var.kms_key_arn
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

# ---- Execution role ------------------------------------------------------
#
# Used by the ECS agent to start a task: pull the image, fetch the injected
# secrets, write the log stream. Not the role application code runs as — each
# service has its own task role in the service module.

data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-required-secrets"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [for name in local.required_secrets : aws_secretsmanager_secret.app[name].arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.kms_key_arn
        Condition = {
          StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" }
        }
      },
    ]
  })
}

# ---- Load balancer -------------------------------------------------------

resource "aws_lb" "main" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [var.alb_security_group_id]

  drop_invalid_header_fields = true
  enable_deletion_protection = var.environment == "prod"
  # A card read (OCR) and a streamed chat answer both run past the 60 s default
  # on a bad day; cutting either mid-response is worse than a slow one.
  idle_timeout = 180
}

resource "aws_lb_target_group" "web" {
  name        = "${var.name_prefix}-web"
  port        = var.web_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  # TLS terminates at CloudFront. The default is a refusal: only a request
  # carrying CloudFront's origin header (the rule below) reaches the app, so
  # even a request from inside CloudFront's own address range that did not come
  # through *this* distribution — and therefore past its WAF — is turned away.
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }
}

resource "aws_lb_listener_rule" "from_cloudfront" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  condition {
    http_header {
      http_header_name = "X-AgroSense-Origin"
      values           = [var.origin_secret]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}
