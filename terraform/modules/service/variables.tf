variable "name" {
  description = "Short service name: web, api or engine. Also its Service Connect name."
  type        = string
}
variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "region" { type = string }

variable "cluster_arn" { type = string }
variable "namespace_arn" { type = string }
variable "execution_role_arn" { type = string }
variable "subnet_ids" { type = list(string) }
variable "security_group_ids" { type = list(string) }

variable "cpu" { type = number }
variable "memory" { type = number }
variable "desired_count" {
  type    = number
  default = 1
}
variable "image_tag" {
  type    = string
  default = "latest"
}
variable "port" { type = number }

variable "environment_variables" {
  type    = map(string)
  default = {}
}
variable "secrets" {
  description = "Environment variable name -> Secrets Manager ARN, injected by ECS at start."
  type        = map(string)
  default     = {}
}
variable "task_policy_json" {
  description = "IAM policy for the application itself. Null for a service that needs no AWS access."
  type        = string
  default     = null
}

variable "health_command" { type = list(string) }
variable "health_start_period" {
  description = "Seconds a new task has before failed health checks count (model loading)."
  type        = number
  default     = 60
  validation {
    condition     = var.health_start_period >= 0 && var.health_start_period <= 300
    error_message = "ECS allows a health-check start period of 0-300 seconds."
  }
}

variable "target_group_arn" {
  description = "Set for the one service behind the load balancer; null otherwise."
  type        = string
  default     = null
}
variable "discovery_name" {
  description = "Service Connect name other services call it by; null for a client-only service."
  type        = string
  default     = null
}

variable "log_retention_days" {
  type    = number
  default = 30
}
