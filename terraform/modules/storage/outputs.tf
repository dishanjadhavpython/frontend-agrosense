output "uploads_bucket" { value = aws_s3_bucket.uploads.id }
output "uploads_bucket_arn" { value = aws_s3_bucket.uploads.arn }
output "frontend_bucket" { value = aws_s3_bucket.frontend.id }
output "frontend_bucket_arn" { value = aws_s3_bucket.frontend.arn }
output "frontend_bucket_regional_domain" { value = aws_s3_bucket.frontend.bucket_regional_domain_name }
output "documents_table" { value = aws_dynamodb_table.documents.name }
output "reports_table" { value = aws_dynamodb_table.reports.name }
output "ratelimit_table" { value = aws_dynamodb_table.ratelimit.name }
output "table_arns" {
  value = [
    aws_dynamodb_table.documents.arn,
    aws_dynamodb_table.reports.arn,
    aws_dynamodb_table.ratelimit.arn,
  ]
}
