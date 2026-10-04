output "kms_key_arn" { value = aws_kms_key.main.arn }
output "trail_arn" { value = aws_cloudtrail.main.arn }
output "trail_bucket" { value = aws_s3_bucket.trail.id }
output "guardduty_detector_id" { value = aws_guardduty_detector.main.id }
output "guardrail_arn" { value = aws_bedrock_guardrail.chat.guardrail_arn }
output "guardrail_id" { value = aws_bedrock_guardrail.chat.guardrail_id }
output "guardrail_version" { value = aws_bedrock_guardrail_version.chat.version }
