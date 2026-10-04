output "site_url" {
  description = "The app. Open this."
  value       = local.site_url
}

output "cloudfront_distribution_id" {
  description = "For invalidations after a deploy."
  value       = module.edge.distribution_id
}

output "ecr_repositories" {
  description = "docker push each image here, then force a new deployment of its service."
  value = {
    web    = module.web.ecr_repository_url
    api    = module.api.ecr_repository_url
    engine = module.engine.ecr_repository_url
    agents = module.agents.ecr_repository_url
  }
}

output "ecs_cluster" { value = module.platform.cluster_name }

output "ecs_services" {
  value = {
    web    = module.web.service_name
    api    = module.api.service_name
    engine = module.engine.service_name
  }
}

output "agents_function" { value = module.agents.function_name }

output "secret_arns" {
  description = "Populate each with `aws secretsmanager put-secret-value`. Terraform never holds the values."
  value       = module.platform.secret_arns
}

output "bedrock" {
  value = {
    model             = var.bedrock_model_id
    chat_model        = local.chat_model_id
    guardrail_id      = module.security.guardrail_id
    guardrail_version = module.security.guardrail_version
  }
}

output "security" {
  value = {
    kms_key_arn  = module.security.kms_key_arn
    trail        = module.security.trail_arn
    trail_bucket = module.security.trail_bucket
    guardduty    = module.security.guardduty_detector_id
  }
}

output "alb_dns_name" {
  description = "Answers 403 to anything but CloudFront — a curl from a laptop is refused, which is correct."
  value       = module.platform.alb_dns_name
}
