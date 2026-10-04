/**
 * One ECS Fargate service — used three times: the web app, the reading service
 * (`api`) and the recommendation engine. Each gets its own image repository,
 * log group and task role, so a compromise of one is not a key to the others:
 * the engine's role can do nothing at all, the web app's can do nothing at all,
 * and only the API's reaches Bedrock, DynamoDB and S3.
 *
 * ARM64/Graviton throughout: ~20% cheaper for the same work, and torch,
 * LightGBM, CatBoost and Node all ship ARM builds. Images must be built for it
 * (`docker build --platform linux/arm64`) or the task crash-loops with an exec
 * format error that reads like a code bug.
 */

resource "aws_ecr_repository" "this" {
  name                 = "${var.name_prefix}-${var.name}"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.environment != "prod"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# Images are large (the API is ~2 GB with torch). Without a lifecycle rule the
# repository grows by that much per deploy, forever.
resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 5 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.name_prefix}-${var.name}"
  retention_in_days = var.log_retention_days
}

# ---- Task role: what the application code itself may do -------------------

data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy" "task" {
  count  = var.task_policy_json == null ? 0 : 1
  name   = "${var.name}-app"
  role   = aws_iam_role.task.id
  policy = var.task_policy_json
}

# ---- Task definition -----------------------------------------------------

resource "aws_ecs_task_definition" "this" {
  family                   = "${var.name_prefix}-${var.name}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name      = var.name
    image     = "${aws_ecr_repository.this.repository_url}:${var.image_tag}"
    essential = true

    # Named, because Service Connect refers to the port by name.
    portMappings = [{
      name          = "http"
      containerPort = var.port
      protocol      = "tcp"
      appProtocol   = "http"
    }]

    environment = [for k, v in var.environment_variables : { name = k, value = v }]

    # `secrets`, not `environment`: the value never appears in the task
    # definition, so never in Terraform state or the console.
    secrets = [for k, arn in var.secrets : { name = k, valueFrom = arn }]

    linuxParameters = {
      initProcessEnabled = true
      # None of the three binds a privileged port or needs any capability.
      capabilities = { drop = ["ALL"] }
    }

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = var.name
      }
    }

    # Fails the task before anything else notices, so a wedged process is
    # replaced rather than left serving errors.
    healthCheck = {
      command     = var.health_command
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = var.health_start_period
    }

    stopTimeout = 30
  }])
}

# ---- Service -------------------------------------------------------------

resource "aws_ecs_service" "this" {
  name            = "${var.name_prefix}-${var.name}"
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  propagate_tags          = "SERVICE"
  enable_ecs_managed_tags = true

  network_configuration {
    subnets = var.subnet_ids
    # The public IP is what replaces a NAT Gateway (~$35/month). Inbound is
    # still only what the security group admits — see the network module.
    assign_public_ip = true
    security_groups  = var.security_group_ids
  }

  dynamic "load_balancer" {
    for_each = var.target_group_arn == null ? [] : [var.target_group_arn]
    content {
      target_group_arn = load_balancer.value
      container_name   = var.name
      container_port   = var.port
    }
  }

  health_check_grace_period_seconds = var.target_group_arn == null ? null : var.health_start_period

  service_connect_configuration {
    enabled   = true
    namespace = var.namespace_arn

    # A server publishes a name; a pure client (the web app) only resolves.
    dynamic "service" {
      for_each = var.discovery_name == null ? [] : [var.discovery_name]
      content {
        port_name      = "http"
        discovery_name = service.value
        client_alias {
          port     = var.port
          dns_name = service.value
        }
        # Service Connect's default per-request timeout is 15 s. A card read is
        # OCR over a scanned PDF and a chat answer is streamed for seconds; at
        # the default, both would be cut off mid-response.
        timeout {
          idle_timeout_seconds        = 300
          per_request_timeout_seconds = 240
        }
      }
    }

    log_configuration {
      log_driver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.this.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "${var.name}-connect"
      }
    }
  }

  # A new task has to pass its health check before the old one is stopped, and
  # a deploy that never becomes healthy rolls itself back.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}
