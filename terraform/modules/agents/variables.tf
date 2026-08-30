variable "name_prefix" { type = string }
variable "region" { type = string }
variable "reports_table" { type = string }
variable "reports_table_arn" { type = string }
variable "secret_arns" { type = map(string) }
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
