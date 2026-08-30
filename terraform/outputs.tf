output "site_url" {
  description = "The app. Open this."
  value       = "https://${module.frontend.distribution_domain}"
}

output "cloudfront_distribution_id" {
  description = "For invalidations after a deploy."
  value       = module.frontend.distribution_id
}

output "backend_ecr_repository" {
  description = "docker push here, then force a new ECS deployment."
  value       = module.backend.ecr_repository_url
}

output "agents_ecr_repository" {
  value = module.agents.ecr_repository_url
}

output "frontend_bucket" {
  description = "aws s3 sync the OpenNext assets here."
  value       = module.storage.frontend_bucket
}

output "ecs_cluster" { value = module.backend.cluster_name }
output "ecs_service" { value = module.backend.service_name }

output "secret_arns" {
  description = "Populate each with `aws secretsmanager put-secret-value`. Terraform never holds the values."
  value       = module.backend.secret_arns
}

output "alb_dns_name" {
  description = "Reachable only from CloudFront's prefix list — curl from a laptop will time out, which is correct."
  value       = module.backend.alb_dns_name
}
