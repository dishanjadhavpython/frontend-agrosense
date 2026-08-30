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
  default     = 75
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

variable "next_origin_domain" {
  description = <<-EOT
    Host of the Next.js server origin — an OpenNext Lambda function URL,
    without the scheme.

    There is no default because there is no correct one. On the very first
    apply, before OpenNext has run, pass any resolvable host as a placeholder
    and re-apply once the real function URL exists:

      terraform apply -var next_origin_domain=example.com
  EOT
  type        = string
}
