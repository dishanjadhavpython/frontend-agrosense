variable "name_prefix" { type = string }
variable "region" { type = string }
variable "web_port" {
  description = "The Next.js container port — the only one the load balancer reaches."
  type        = number
  default     = 3000
}
