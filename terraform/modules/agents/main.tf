/**
 * The research sweep, on a schedule.
 *
 * This is the half of the workload Lambda is genuinely right for. The sweep
 * runs every thirty minutes, does nothing at all most of the time, and when it
 * does work it is a burst of network-bound calls — so scaling to zero between
 * runs is the correct shape, and a cold start costs nobody anything because no
 * farmer is waiting on it.
 *
 * A container image rather than a zip: the sweep imports the same
 * `backend.agents` package the service does, which pulls the agents SDK and
 * five MCP servers well past the 250 MB zip limit.
 *
 * On-demand research — the runs that start the moment a farmer hits Predict —
 * is NOT here. That happens in-process on the Fargate task, because it has to
 * begin within the request and report progress back through
 * `/api/insights/...`. See `backend/agents/queue.py`.
 */

resource "aws_ecr_repository" "agents" {
  name                 = "${var.name_prefix}-agents"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "agents" {
  repository = aws_ecr_repository.agents.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 3 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 3
      }
      action = { type = "expire" }
    }]
  })
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "agents" {
  name               = "${var.name_prefix}-agents"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "agents_logs" {
  role       = aws_iam_role.agents.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "agents_data" {
  name = "agent-data"
  role = aws_iam_role.agents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        # Reports and the demand ledger. The sweep never touches an uploaded
        # card — it researches crops and soils, not documents.
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ]
        Resource = var.reports_table_arn
      },
      {
        # Only the optional tool keys (YouTube, data.gov.in). The model needs
        # no key at all: Bedrock is reached with this role.
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = values(var.secret_arns)
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = var.kms_key_arn
        Condition = {
          StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" }
        }
      },
      {
        # Nova Pro through the APAC cross-region profile: the profile itself,
        # plus the model in every region the profile may route a call to.
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = var.bedrock_resource_arns
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "agents" {
  name              = "/aws/lambda/${var.name_prefix}-agents"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "agents" {
  function_name = "${var.name_prefix}-agents"
  role          = aws_iam_role.agents.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.agents.repository_url}:${var.image_tag}"

  architectures = ["arm64"]

  # A topic is four LLM calls plus a dozen page fetches. Six topics per sweep
  # against a 15-minute ceiling — the batch size exists to stay inside this.
  timeout     = 900
  memory_size = 2048

  # No reserved concurrency. Reserving even one execution fails on an account
  # still at Lambda's starting quota of 10, because AWS keeps 10 unreserved.
  # Overlap is prevented instead by the schedule (every 30 min) against a
  # 15-minute timeout, and by not retrying a failed sweep (below).

  environment {
    variables = {
      # Shared with the reading service: reports, the demand ledger and run
      # status live in DynamoDB, so what this Lambda researches is what a
      # farmer's page reads (backend/agents/kv.py).
      AGROSENSE_REPORTS_TABLE = var.reports_table
      AGROSENSE_DATA_DIR      = "/tmp/agrosense"
      AWS_REGION_NAME         = var.region
      # Secrets are read at runtime through the SDK rather than injected as
      # env vars — a Lambda's environment is visible in the console, and a
      # `terraform plan` diff would print any value set here.
      AGROSENSE_SECRET_PREFIX     = var.secret_prefix
      AGROSENSE_LLM_PROVIDER      = "bedrock"
      AGROSENSE_BEDROCK_REGION    = var.region
      AGROSENSE_BEDROCK_MODEL     = var.bedrock_model_id
      AGROSENSE_AGENTS_ENABLED    = "1"
      AGROSENSE_AGENTS_BATCH_SIZE = tostring(var.batch_size)
    }
  }

  depends_on = [aws_cloudwatch_log_group.agents]
}

resource "aws_cloudwatch_event_rule" "sweep" {
  name                = "${var.name_prefix}-agent-sweep"
  description         = "Catches whatever the on-demand queue capped or skipped."
  schedule_expression = "rate(${var.sweep_minutes} minutes)"
}

resource "aws_cloudwatch_event_target" "sweep" {
  rule      = aws_cloudwatch_event_rule.sweep.name
  target_id = "agents"
  arn       = aws_lambda_function.agents.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.agents.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.sweep.arn
}

# EventBridge invokes asynchronously, and Lambda would retry a failed sweep
# twice — three runs of the same research, billed three times. The next
# scheduled sweep picks up whatever this one missed.
resource "aws_lambda_function_event_invoke_config" "agents" {
  function_name                = aws_lambda_function.agents.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 1800
}
