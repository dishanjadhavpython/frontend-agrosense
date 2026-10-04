variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "region" { type = string }
variable "suffix" {
  description = "Stable suffix for globally unique bucket names."
  type        = string
}
variable "trail_retention_days" {
  type    = number
  default = 365
}
variable "guardduty_runtime_monitoring" {
  type    = bool
  default = false
}
variable "enable_security_hub" {
  type    = bool
  default = false
}
variable "enable_inspector" {
  type    = bool
  default = false
}
