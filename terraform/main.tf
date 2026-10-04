/**
 * AgroSense on AWS.
 *
 *     farmer's phone
 *          │  HTTPS
 *     CloudFront ── WAF (IP reputation, common + known-bad inputs, per-IP rate
 *          │         limits on the site, /api/* and /api/chat; bot control opt-in)
 *          │  HTTP + X-AgroSense-Origin   (only CloudFront's address range,
 *          ▼                               only with the origin header)
 *     ALB ──► web      Next.js on Fargate: pages, sign-in, API routes
 *                │  Service Connect (private; no public route to either)
 *                ├──► api     the reading service: OCR, soil/crop/fertilizer
 *                │            models, document Q&A, farmer chat, on-demand research
 *                └──► engine  taluka × season recommendation engine
 *
 *     api ──► Amazon Bedrock (Nova Pro, APAC profile) + Guardrail, DynamoDB, S3
 *     EventBridge (30 min) ──► Lambda research sweep ──► Bedrock, DynamoDB
 *     KMS · CloudTrail · GuardDuty · Access Analyzer  (+ Security Hub, Inspector)
 *
 * Two shapes of compute, for two reasons. The three services are always warm
 * because a farmer waits on them and a torch cold start is 30-60 seconds. The
 * research sweep scales to zero because nobody waits on it and it idles most of
 * the day.
 */

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project}-${var.environment}"
  # S3 bucket names are global; derived from the name so it is stable.
  suffix = substr(sha256("${local.name_prefix}-${data.aws_caller_identity.current.account_id}"), 0, 8)

  chat_model_id = var.bedrock_chat_model_id != "" ? var.bedrock_chat_model_id : var.bedrock_model_id

  # The one address farmers use. The reading service accepts Clerk session
  # tokens issued to this origin only (CLERK_AUTHORIZED_PARTIES).
  site_url = var.domain_name != "" ? "https://${var.domain_name}" : "https://${module.edge.distribution_domain}"

  # Cross-region inference: the caller needs the profile *and* the underlying
  # model in every region the profile may route to (hence the `*` region).
  bedrock_resource_arns = distinct(flatten([
    for id in [var.bedrock_model_id, local.chat_model_id] : [
      "arn:aws:bedrock:${var.region}:${data.aws_caller_identity.current.account_id}:inference-profile/${id}",
      "arn:aws:bedrock:*::foundation-model/${replace(id, "/^(us|eu|apac|global)\\./", "")}",
    ]
  ]))

  optional_secret_names = ["youtube-api-key", "data-gov-in-api-key"]
}

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  region      = var.region
}

module "security" {
  source = "./modules/security"

  name_prefix                  = local.name_prefix
  environment                  = var.environment
  region                       = var.region
  suffix                       = local.suffix
  trail_retention_days         = var.trail_retention_days
  guardduty_runtime_monitoring = var.guardduty_runtime_monitoring
  enable_security_hub          = var.enable_security_hub
  enable_inspector             = var.enable_inspector
}

module "storage" {
  source = "./modules/storage"

  name_prefix         = local.name_prefix
  card_retention_days = var.card_retention_days
}

# The shared secret CloudFront sends to the load balancer. Generated, never
# typed: no human needs it, and the listener forwards nothing without it.
resource "random_password" "origin_secret" {
  length  = 48
  special = false
}

module "platform" {
  source = "./modules/platform"

  name_prefix           = local.name_prefix
  environment           = var.environment
  region                = var.region
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  alb_security_group_id = module.network.alb_security_group_id
  kms_key_arn           = module.security.kms_key_arn
  origin_secret         = random_password.origin_secret.result
}

# ---- The reading service --------------------------------------------------

module "api" {
  source = "./modules/service"

  name          = "api"
  name_prefix   = local.name_prefix
  environment   = var.environment
  region        = var.region
  cpu           = var.backend_cpu
  memory        = var.backend_memory
  desired_count = var.backend_desired_count
  image_tag     = var.backend_image_tag
  port          = 8000

  cluster_arn        = module.platform.cluster_arn
  namespace_arn      = module.platform.namespace_arn
  execution_role_arn = module.platform.execution_role_arn
  subnet_ids         = module.network.public_subnet_ids
  security_group_ids = [module.network.service_security_group_id]
  discovery_name     = "api"
  log_retention_days = var.log_retention_days

  # torch plus the EfficientNet checkpoint load in the background at boot
  # (backend/app.py `_warm_models`); health passes at once, this is headroom.
  health_command      = ["CMD-SHELL", "python -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5)\" || exit 1"]
  health_start_period = 180

  environment_variables = {
    AWS_REGION                          = var.region
    AGROSENSE_DATA_DIR                  = "/tmp/agrosense"
    AGROSENSE_UPLOADS_BUCKET            = module.storage.uploads_bucket
    AGROSENSE_DOCUMENTS_TABLE           = module.storage.documents_table
    AGROSENSE_REPORTS_TABLE             = module.storage.reports_table
    AGROSENSE_RATELIMIT_TABLE           = module.storage.ratelimit_table
    AGROSENSE_SECRET_PREFIX             = module.platform.secret_prefix
    AGROSENSE_LLM_PROVIDER              = "bedrock"
    AGROSENSE_BEDROCK_REGION            = var.region
    AGROSENSE_BEDROCK_MODEL             = var.bedrock_model_id
    AGROSENSE_BEDROCK_CHAT_MODEL        = local.chat_model_id
    AGROSENSE_BEDROCK_GUARDRAIL_ID      = module.security.guardrail_id
    AGROSENSE_BEDROCK_GUARDRAIL_VERSION = module.security.guardrail_version
    AGROSENSE_AGENTS_ENABLED            = "1"
    CLERK_AUTHORIZED_PARTIES            = local.site_url
    # The timed sweep is the Lambda's; this process keeps on-demand research.
    AGROSENSE_AGENTS_SCHEDULER = "0"
    AGROSENSE_OLLAMA_ENABLED   = "0"
  }

  secrets = {
    CLERK_SECRET_KEY  = module.platform.secret_arns["clerk-secret-key"]
    AGROSENSE_API_KEY = module.platform.secret_arns["agrosense-api-key"]
  }

  task_policy_json = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${module.storage.uploads_bucket_arn}/uploads/*"
      },
      {
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = module.storage.uploads_bucket_arn
        Condition = { StringLike = { "s3:prefix" = ["uploads/*"] } }
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
        Resource = module.storage.table_arns
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = local.bedrock_resource_arns
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:ApplyGuardrail"]
        Resource = module.security.guardrail_arn
      },
      {
        # The optional tool keys, read at startup (backend/config.py).
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [for n in local.optional_secret_names : module.platform.secret_arns[n]]
      },
      {
        Effect    = "Allow"
        Action    = ["kms:Decrypt"]
        Resource  = module.security.kms_key_arn
        Condition = { StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" } }
      },
    ]
  })
}

# ---- The recommendation engine --------------------------------------------

module "engine" {
  source = "./modules/service"

  name          = "engine"
  name_prefix   = local.name_prefix
  environment   = var.environment
  region        = var.region
  cpu           = var.engine_cpu
  memory        = var.engine_memory
  desired_count = var.engine_desired_count
  image_tag     = var.engine_image_tag
  port          = 8001

  cluster_arn        = module.platform.cluster_arn
  namespace_arn      = module.platform.namespace_arn
  execution_role_arn = module.platform.execution_role_arn
  subnet_ids         = module.network.public_subnet_ids
  security_group_ids = [module.network.service_security_group_id]
  discovery_name     = "engine"
  log_retention_days = var.log_retention_days

  # The fitted pipeline ships in the image; if its cache key no longer matches
  # the code, the engine refits on boot, which takes minutes — hence the
  # long start period rather than a crash loop.
  health_command      = ["CMD-SHELL", "python -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=5)\" || exit 1"]
  health_start_period = 900

  environment_variables = {
    # The serving soil classifier's confusion matrix, copied into the image by
    # scripts/sync_engine_assets.sh, so fusion weighs a photo by its errors.
    AGROSENSE_SOIL_MODEL_META = "/app/artifacts/soil_classifier_metadata.json"
  }
  # No AWS access at all: the engine reads only what is in its own image.
  task_policy_json = null
}

# ---- The web app ----------------------------------------------------------

module "web" {
  source = "./modules/service"

  name          = "web"
  name_prefix   = local.name_prefix
  environment   = var.environment
  region        = var.region
  cpu           = var.web_cpu
  memory        = var.web_memory
  desired_count = var.web_desired_count
  image_tag     = var.web_image_tag
  port          = 3000

  cluster_arn        = module.platform.cluster_arn
  namespace_arn      = module.platform.namespace_arn
  execution_role_arn = module.platform.execution_role_arn
  subnet_ids         = module.network.public_subnet_ids
  security_group_ids = [module.network.service_security_group_id]
  target_group_arn   = module.platform.web_target_group_arn
  log_retention_days = var.log_retention_days

  health_command      = ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1"]
  health_start_period = 60

  environment_variables = {
    # Service Connect names — private to the namespace.
    AGROSENSE_API_BASE                = "http://api:8000"
    RECOMMEND_API_BASE                = "http://engine:8001"
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = var.clerk_publishable_key
    NEXT_PUBLIC_CLERK_SIGN_IN_URL     = "/sign-in"
    NEXT_PUBLIC_CLERK_SIGN_UP_URL     = "/sign-up"
  }

  secrets = {
    CLERK_SECRET_KEY  = module.platform.secret_arns["clerk-secret-key"]
    AGROSENSE_API_KEY = module.platform.secret_arns["agrosense-api-key"]
  }
  # The web app calls its two neighbours over Service Connect and nothing else.
  task_policy_json = null
}

# ---- The research sweep ---------------------------------------------------

module "agents" {
  source = "./modules/agents"

  name_prefix           = local.name_prefix
  region                = var.region
  image_tag             = var.agents_image_tag
  batch_size            = var.agents_batch_size
  reports_table         = module.storage.reports_table
  reports_table_arn     = module.storage.table_arns[1]
  secret_arns           = { for n in local.optional_secret_names : n => module.platform.secret_arns[n] }
  secret_prefix         = module.platform.secret_prefix
  kms_key_arn           = module.security.kms_key_arn
  bedrock_model_id      = var.bedrock_model_id
  bedrock_resource_arns = local.bedrock_resource_arns
  log_retention_days    = var.log_retention_days
}

# ---- Edge -----------------------------------------------------------------

module "waf" {
  source = "./modules/waf"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix              = local.name_prefix
  rate_limit_per_5min      = var.waf_rate_limit_per_5min
  api_rate_limit_per_5min  = var.waf_api_rate_limit_per_5min
  chat_rate_limit_per_5min = var.waf_chat_rate_limit_per_5min
  bot_control              = var.waf_bot_control
  logging                  = var.waf_logging
}

module "observability" {
  source = "./modules/observability"

  name_prefix        = local.name_prefix
  environment        = var.environment
  suffix             = local.suffix
  alert_email        = var.budget_alert_email
  monthly_budget_usd = var.monthly_budget_usd

  # CloudWatch wants the ARN suffix, not the full ARN.
  target_group_suffix  = module.platform.web_target_group_suffix
  load_balancer_suffix = module.platform.load_balancer_suffix
  agents_function_name = module.agents.function_name
}

module "edge" {
  source = "./modules/edge"

  name_prefix         = local.name_prefix
  alb_dns_name        = module.platform.alb_dns_name
  web_acl_arn         = module.waf.web_acl_arn
  log_bucket_domain   = module.observability.log_bucket_domain
  origin_secret       = random_password.origin_secret.result
  price_class         = var.cloudfront_price_class
  domain_name         = var.domain_name
  acm_certificate_arn = var.acm_certificate_arn
}
