output "log_bucket" { value = aws_s3_bucket.logs.id }
output "log_bucket_domain" { value = aws_s3_bucket.logs.bucket_domain_name }
