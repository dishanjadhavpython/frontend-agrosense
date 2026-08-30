variable "name_prefix" { type = string }
variable "environment" { type = string }
variable "frontend_bucket" { type = string }
variable "frontend_bucket_arn" { type = string }
variable "frontend_bucket_regional_domain" { type = string }
variable "alb_dns_name" { type = string }
variable "web_acl_arn" { type = string }
variable "log_bucket_domain" { type = string }
variable "origin_secret" {
  description = "Sent to the ALB as X-AgroSense-Key. The service refuses anything without it."
  type        = string
  sensitive   = true
}
variable "next_origin_domain" {
  description = <<-EOT
    The Next.js server origin — an OpenNext Lambda function URL host, without
    the scheme.

    Not created here on purpose: OpenNext owns the function bundle and the
    asset manifest, and a Terraform module that built those would have to know
    about the Next build output. Run OpenNext first, pass the host in.
  EOT
  type        = string
}
