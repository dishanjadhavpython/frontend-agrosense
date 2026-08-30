/**
 * AgroSense on AWS.
 *
 *                          CloudFront  +  WAF
 *                                 │
 *          ┌──────────────────────┼──────────────────────┐
 *          │                      │                      │
 *    /_next/static/*       everything else          /api/py/*
 *          │                      │                      │
 *         S3            Lambda (Next, OpenNext)   ALB → Fargate (ARM64)
 *                                                         │  torch, tesseract
 *                                          S3 · DynamoDB · Secrets Manager
 *                                                         ▲
 *                              EventBridge (30 min) → Lambda (research sweep)
 *
 * Two shapes of compute, chosen for two different reasons rather than for
 * consistency. The reading service is always warm because a farmer waits on
 * it and a torch cold start is 30-60 seconds. The research sweep scales to
 * zero because nobody waits on it and it idles most of the day.
 *
 * Apply order and the OpenNext step are in README.md — `next_origin_domain`
 * has no sensible default and the first apply needs a placeholder.
 */

locals {
  name_prefix = "${var.project}-${var.environment}"
}

module "network" {
  source = "./modules/network"

  name_prefix = local.name_prefix
  region      = var.region
}

module "storage" {
  source = "./modules/storage"

  name_prefix         = local.name_prefix
  card_retention_days = var.card_retention_days
}

module "backend" {
  source = "./modules/backend"

  name_prefix = local.name_prefix
  environment = var.environment
  region      = var.region

  vpc_id                    = module.network.vpc_id
  public_subnet_ids         = module.network.public_subnet_ids
  alb_security_group_id     = module.network.alb_security_group_id
  service_security_group_id = module.network.service_security_group_id

  cpu           = var.backend_cpu
  memory        = var.backend_memory
  desired_count = var.backend_desired_count
  image_tag     = var.backend_image_tag

  uploads_bucket     = module.storage.uploads_bucket
  uploads_bucket_arn = module.storage.uploads_bucket_arn
  documents_table    = module.storage.documents_table
  reports_table      = module.storage.reports_table
  ratelimit_table    = module.storage.ratelimit_table
  table_arns         = module.storage.table_arns
}

module "agents" {
  source = "./modules/agents"

  name_prefix       = local.name_prefix
  region            = var.region
  reports_table     = module.storage.reports_table
  reports_table_arn = module.storage.table_arns[1]
  secret_arns       = module.backend.secret_arns
}

module "waf" {
  source = "./modules/waf"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix             = local.name_prefix
  rate_limit_per_5min     = var.waf_rate_limit_per_5min
  api_rate_limit_per_5min = var.waf_api_rate_limit_per_5min
  bot_control             = var.waf_bot_control
}

# The shared secret CloudFront sends to the ALB. Generated rather than typed:
# it is never seen by a human and never needs to be.
resource "random_password" "origin_secret" {
  length  = 48
  special = false
}

module "observability" {
  source = "./modules/observability"

  name_prefix = local.name_prefix
  environment = var.environment
  # S3 bucket names are globally unique across every AWS account, so the log
  # bucket needs a suffix for the same reason the others do. Derived from the
  # name rather than random, so it is stable across applies.
  suffix             = substr(sha256(local.name_prefix), 0, 8)
  alert_email        = var.budget_alert_email
  monthly_budget_usd = var.monthly_budget_usd

  # CloudWatch wants the ARN suffix, not the full ARN.
  target_group_suffix  = module.backend.target_group_suffix
  load_balancer_suffix = module.backend.load_balancer_suffix
  agents_function_name = module.agents.function_name
}

module "frontend" {
  source = "./modules/frontend"

  name_prefix = local.name_prefix
  environment = var.environment

  frontend_bucket                 = module.storage.frontend_bucket
  frontend_bucket_arn             = module.storage.frontend_bucket_arn
  frontend_bucket_regional_domain = module.storage.frontend_bucket_regional_domain

  alb_dns_name       = module.backend.alb_dns_name
  web_acl_arn        = module.waf.web_acl_arn
  log_bucket_domain  = module.observability.log_bucket_domain
  origin_secret      = random_password.origin_secret.result
  next_origin_domain = var.next_origin_domain
}
