variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "region" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "alb_security_group_id" { type = string }
variable "kms_key_arn" {
  description = "Customer-managed key the secrets are encrypted with."
  type        = string
}
variable "web_port" {
  type    = number
  default = 3000
}
variable "origin_secret" {
  description = "Value CloudFront sends as X-AgroSense-Origin; the listener forwards nothing else."
  type        = string
  sensitive   = true
}
