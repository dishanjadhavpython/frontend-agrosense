variable "name_prefix" { type = string }
variable "region" { type = string }
variable "reports_table" { type = string }
variable "reports_table_arn" { type = string }
variable "secret_arns" {
  description = "The optional tool-key secrets this function may read."
  type        = map(string)
}
variable "secret_prefix" { type = string }
variable "kms_key_arn" { type = string }
variable "bedrock_model_id" { type = string }
variable "bedrock_resource_arns" { type = list(string) }
variable "batch_size" {
  description = "Topics researched per sweep — the ceiling on Bedrock spend per run."
  type        = number
  default     = 6
}
variable "image_tag" {
  type    = string
  default = "latest"
}
variable "sweep_minutes" {
  type    = number
  default = 30
}
variable "log_retention_days" {
  type    = number
  default = 30
}
