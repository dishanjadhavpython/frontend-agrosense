output "cluster_arn" { value = aws_ecs_cluster.main.arn }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "namespace_arn" { value = aws_service_discovery_http_namespace.main.arn }
output "execution_role_arn" { value = aws_iam_role.execution.arn }
output "alb_dns_name" { value = aws_lb.main.dns_name }
output "web_target_group_arn" { value = aws_lb_target_group.web.arn }
output "listener_arn" { value = aws_lb_listener.http.arn }

# CloudWatch dimensions want the ARN suffix, not the ARN.
output "web_target_group_suffix" { value = aws_lb_target_group.web.arn_suffix }
output "load_balancer_suffix" { value = aws_lb.main.arn_suffix }

output "secret_arns" { value = { for k, s in aws_secretsmanager_secret.app : k => s.arn } }
output "secret_prefix" { value = "${var.name_prefix}/" }
