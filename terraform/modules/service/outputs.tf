output "ecr_repository_url" { value = aws_ecr_repository.this.repository_url }
output "service_name" { value = aws_ecs_service.this.name }
output "task_role_arn" { value = aws_iam_role.task.arn }
output "task_role_name" { value = aws_iam_role.task.name }
output "log_group" { value = aws_cloudwatch_log_group.this.name }
