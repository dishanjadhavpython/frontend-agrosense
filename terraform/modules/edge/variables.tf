variable "name_prefix" { type = string }
variable "alb_dns_name" { type = string }
variable "web_acl_arn" { type = string }
variable "log_bucket_domain" { type = string }
variable "origin_secret" {
  type      = string
  sensitive = true
}
variable "price_class" {
  type    = string
  default = "PriceClass_200"
}
variable "domain_name" {
  description = "Optional custom domain (e.g. agrosense.example.in). Empty uses the cloudfront.net name."
  type        = string
  default     = ""
}
variable "acm_certificate_arn" {
  description = "ACM certificate for domain_name — must be in us-east-1, as CloudFront requires."
  type        = string
  default     = ""
}
