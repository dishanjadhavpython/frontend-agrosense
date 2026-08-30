/**
 * The reading service: ECR, ECS Fargate, an ALB, and the secrets it needs.
 *
 * Fargate rather than Lambda, and the reason is the one thing the deployment
 * brief asked for — no lag. The service loads torch and tesseract; on Lambda
 * that is a 30-60 second cold start on the first prediction after any quiet
 * period, on exactly the request a farmer is standing there waiting for. A
 * warm task costs about $20/month and removes the problem rather than
 * mitigating it. The bursty work that *is* a good fit for Lambda — the
 * research sweep — is in the `agents` module.
 *
 * ARM64/Graviton throughout: ~20% cheaper for the same work, and torch ships
 * ARM wheels. The image must be built for it (see terraform/README.md).
 */

resource "aws_ecr_repository" "backend" {
  name                 = "${var.name_prefix}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

# The image is ~2 GB with torch in it. Without this the repository grows by
# that much per deploy, forever, at $0.10/GB/month.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

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

# ---- Secrets -------------------------------------------------------------
#
# Values are NOT set here. Terraform state is not a secret store — anything
# written into a resource argument is readable in plaintext in the state file,
# which is why these are created empty and populated out of band:
#
#   aws secretsmanager put-secret-value --secret-id <arn> --secret-string '...'

resource "aws_secretsmanager_secret" "app" {
  for_each = toset([
    "openai-api-key",
    "clerk-secret-key",
    "agrosense-api-key",
    "youtube-api-key",
    "data-gov-in-api-key",
  ])

  name                    = "${var.name_prefix}/${each.key}"
  description             = "Set with put-secret-value; never through Terraform."
  recovery_window_in_days = var.environment == "prod" ? 30 : 0
}

# ---- IAM -----------------------------------------------------------------

data "aws_iam_policy_document" "task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# The execution role is used by the ECS agent to start the task: pull the
# image, fetch the secrets, write the log stream. It is not the role the
# application code runs as.
resource "aws_iam_role" "execution" {
  name               = "${var.name_prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-secrets"
  role = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [for s in aws_secretsmanager_secret.app : s.arn]
    }]
  })
}

# The task role is what the application itself uses. Scoped to exactly the
# buckets and tables it needs, and to nothing else — the S3 statement is
# limited to the uploads prefix so a bug cannot reach the frontend bucket.
resource "aws_iam_role" "task" {
  name               = "${var.name_prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume.json
}

resource "aws_iam_role_policy" "task_data" {
  name = "app-data"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${var.uploads_bucket_arn}/uploads/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = var.uploads_bucket_arn
        Condition = {
          StringLike = { "s3:prefix" = ["uploads/*"] }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
        ]
        Resource = var.table_arns
      },
    ]
  })
}

# ---- Load balancer -------------------------------------------------------

resource "aws_lb" "api" {
  name               = "${var.name_prefix}-alb"
  load_balancer_type = "application"
  subnets            = var.public_subnet_ids
  security_groups    = [var.alb_security_group_id]

  drop_invalid_header_fields = true
  enable_deletion_protection = var.environment == "prod"
}

resource "aws_lb_target_group" "api" {
  name        = "${var.name_prefix}-api"
  port        = var.service_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id

  health_check {
    path = "/api/health"
    # The public half of /api/health, which is why that endpoint stays
    # reachable without the API key: a health check cannot send a header, and
    # a machine that fails its check is a machine ECS restarts forever.
    matcher             = "200"
    interval            = 30
    timeout             = 10
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # torch takes ~60s to load on boot. Draining faster than that during a
  # deploy would cut a prediction in half.
  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  # TLS terminates at CloudFront; this hop is inside AWS and reachable only
  # from CloudFront's prefix list (see the network module). A certificate here
  # would need a domain this module does not own.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ---- The service ---------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.environment == "prod" ? "enabled" : "disabled"
  }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name      = "api"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{
      containerPort = var.service_port
      protocol      = "tcp"
    }]

    environment = [
      { name = "AGROSENSE_UPLOADS_BUCKET", value = var.uploads_bucket },
      { name = "AGROSENSE_DOCUMENTS_TABLE", value = var.documents_table },
      { name = "AGROSENSE_REPORTS_TABLE", value = var.reports_table },
      { name = "AGROSENSE_RATELIMIT_TABLE", value = var.ratelimit_table },
      { name = "AWS_REGION", value = var.region },
      # The vector store is rebuilt on boot and lives on the task's own disk.
      { name = "AGROSENSE_DATA_DIR", value = "/tmp/agrosense" },
    ]

    # `secrets`, not `environment`. The value never appears in the task
    # definition, so it never appears in Terraform state or in the console.
    secrets = [
      for key, secret in var.secret_arns : {
        name      = key
        valueFrom = secret
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }

    # Fails the task before the ALB does, so a wedged worker is replaced
    # rather than left serving errors.
    healthCheck = {
      command     = ["CMD-SHELL", "python -c \"import urllib.request;urllib.request.urlopen('http://localhost:${var.service_port}/api/health')\" || exit 1"]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 120
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "${var.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets = var.public_subnet_ids
    # The public IP is what replaces the NAT Gateway. Inbound is still only
    # from the ALB's security group — see the network module.
    assign_public_ip = true
    security_groups  = [var.service_security_group_id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.service_port
  }

  # A new task has to pass its health check before the old one is stopped, so
  # a deploy never leaves zero warm models behind the load balancer.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  health_check_grace_period_seconds = 180

  depends_on = [aws_lb_listener.http]
}
