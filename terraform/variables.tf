variable "region" {
  description = "Where the app runs. Mumbai: the farmers and the Agmarknet data are both here."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "dev | prod. Drives naming and a few size decisions."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "project" {
  description = "Name prefix for everything. S3 bucket names are global, so a suffix is added."
  type        = string
  default     = "agrosense"
}

# ---- The reading service -------------------------------------------------

variable "backend_cpu" {
  description = <<-EOT
    Fargate CPU units. 512 = 0.5 vCPU.

    The service loads torch and tesseract and holds them warm, which is why
    this is Fargate rather than Lambda: a 30-60s cold start on the path a
    farmer is waiting on is the definition of the lag this deployment is
    meant to avoid.
  EOT
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "MiB. torch's resident set is most of this; 3 GB is the smallest that does not swap under a prediction."
  type        = number
  default     = 3072
}

variable "backend_desired_count" {
  description = "Tasks kept running. One is enough for this load and is what keeps the model warm; the vector store is per-task so >1 needs the S3 rebuild path first."
  type        = number
  default     = 1
}

variable "backend_image_tag" {
  description = "ECR tag to deploy. Set by CI to the commit sha; `latest` is fine by hand."
  type        = string
  default     = "latest"
}

# ---- Rate limiting -------------------------------------------------------

variable "waf_rate_limit_per_5min" {
  description = <<-EOT
    Requests per 5 minutes per IP, site-wide.

    Deliberately loose. Several farmers in one village share a CGNAT address,
    so a tight per-IP rule blocks the village rather than the abuser. The real
    ceiling is the per-user quota in DynamoDB; this only stops volumetric
    floods before they reach any compute.
  EOT
  type        = number
  default     = 2000
}

variable "waf_api_rate_limit_per_5min" {
  description = "Tighter, for /api/* only — the paths that cost OCR and LLM calls."
  type        = number
  default     = 300
}

variable "waf_bot_control" {
  description = <<-EOT
    AWS Managed Bot Control. Roughly $10/month plus per-request charges.

    Off by default: it is the single largest optional line in the bill and
    turning it on silently would be a cost surprise. Worth enabling once there
    is real traffic to protect.
  EOT
  type        = bool
  default     = false
}

# ---- Cost guard ----------------------------------------------------------

variable "monthly_budget_usd" {
  description = "AWS Budgets alert threshold. An email arrives at 80% and 100%."
  type        = number
  default     = 150
}

variable "budget_alert_email" {
  description = "Where budget alerts go. Empty disables the budget entirely."
  type        = string
  default     = ""
}

# ---- Retention -----------------------------------------------------------

variable "card_retention_days" {
  description = <<-EOT
    How long an uploaded Soil Health Card is kept in S3 before it expires.

    A card is personal data: it carries a farmer's name, village and survey
    number. India's DPDP Act has consent and retention obligations for exactly
    this, and 90 days is an engineering default, not legal advice — it should
    be reviewed before there are real users.
  EOT
  type        = number
  default     = 90
}

# ---- The web app (Next.js on Fargate) --------------------------------------

variable "web_cpu" {
  description = "CPU units for the Next.js task (1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "web_memory" {
  description = "MiB for the Next.js task."
  type        = number
  default     = 1024
}

variable "web_desired_count" {
  type    = number
  default = 1
}

variable "web_image_tag" {
  type    = string
  default = "latest"
}

variable "clerk_publishable_key" {
  description = "Clerk's publishable key (pk_...). Public by design; also baked into the web image at build."
  type        = string
  default     = ""
}

# ---- The recommendation engine (taluka x season) ---------------------------

variable "engine_cpu" {
  description = "The engine holds the 351-taluka feature store and three fitted models in memory."
  type        = number
  default     = 1024
}

variable "engine_memory" {
  type    = number
  default = 4096
}

variable "engine_desired_count" {
  type    = number
  default = 1
}

variable "engine_image_tag" {
  type    = string
  default = "latest"
}

# ---- The research sweep (Lambda) ------------------------------------------

variable "agents_image_tag" {
  type    = string
  default = "latest"
}

variable "agents_batch_size" {
  description = "Topics per scheduled sweep — the ceiling on Bedrock spend per run."
  type        = number
  default     = 6
}

# ---- Amazon Bedrock -------------------------------------------------------

variable "bedrock_model_id" {
  description = <<-EOT
    Model for the research agents and document Q&A. A cross-region inference
    profile: in ap-south-1, Nova Pro is served only through `apac.`.
  EOT
  type        = string
  default     = "apac.amazon.nova-pro-v1:0"
}

variable "bedrock_chat_model_id" {
  description = "Model for the farmer chat. Empty means the same as bedrock_model_id."
  type        = string
  default     = ""
}

# ---- Security -------------------------------------------------------------

variable "guardduty_runtime_monitoring" {
  description = "GuardDuty runtime monitoring for the Fargate tasks. Billed per vCPU-hour."
  type        = bool
  default     = false
}

variable "enable_security_hub" {
  description = "AWS Security Hub with the Foundational Security Best Practices standard."
  type        = bool
  default     = false
}

variable "enable_inspector" {
  description = "Amazon Inspector continuous CVE scanning of the ECR images and the Lambda."
  type        = bool
  default     = false
}

variable "waf_chat_rate_limit_per_5min" {
  description = "Per-IP ceiling on /api/chat, the free-text endpoint that costs a model call."
  type        = number
  default     = 60
}

variable "waf_logging" {
  description = "WAF request logs to CloudWatch (us-east-1), credentials redacted."
  type        = bool
  default     = true
}

variable "trail_retention_days" {
  description = "How long CloudTrail's audit logs are kept."
  type        = number
  default     = 365
}

# ---- Edge -----------------------------------------------------------------

variable "cloudfront_price_class" {
  description = "PriceClass_200 is the cheapest class that includes India's edge locations."
  type        = string
  default     = "PriceClass_200"
}

variable "domain_name" {
  description = "Optional custom domain. Empty serves on the cloudfront.net address."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate for domain_name, in us-east-1 (a CloudFront requirement)."
  type        = string
  default     = ""
}

variable "log_retention_days" {
  type    = number
  default = 30
}
