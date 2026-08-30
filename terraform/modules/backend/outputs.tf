output "alb_dns_name" { value = aws_lb.api.dns_name }
output "ecr_repository_url" { value = aws_ecr_repository.backend.repository_url }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "service_name" { value = aws_ecs_service.api.name }
output "task_role_arn" { value = aws_iam_role.task.arn }
output "secret_arns" { value = { for k, s in aws_secretsmanager_secret.app : k => s.arn } }
output "log_group" { value = aws_cloudwatch_log_group.backend.name }

# CloudWatch dimensions want the ARN suffix, not the ARN.
output "target_group_suffix" { value = aws_lb_target_group.api.arn_suffix }
output "load_balancer_suffix" { value = aws_lb.api.arn_suffix }
