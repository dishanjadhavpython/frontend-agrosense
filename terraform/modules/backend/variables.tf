variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_security_group_id" { type = string }
variable "service_security_group_id" { type = string }
variable "service_port" {
  type    = number
  default = 8000
}
variable "cpu" { type = number }
variable "memory" { type = number }
variable "desired_count" { type = number }
variable "image_tag" { type = string }
variable "uploads_bucket" { type = string }
variable "uploads_bucket_arn" { type = string }
variable "documents_table" { type = string }
variable "reports_table" { type = string }
variable "ratelimit_table" { type = string }
variable "table_arns" { type = list(string) }
variable "log_retention_days" {
  type    = number
  default = 30
}
variable "secret_arns" {
  description = "env var name -> Secrets Manager ARN. Injected as ECS `secrets`."
  type        = map(string)
  default     = {}
}
