# The module needs the us-east-1 alias passed in — a CLOUDFRONT-scoped web ACL
# exists only in that region, whatever region the rest of the stack is in.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.80"
      configuration_aliases = [aws.us_east_1]
    }
  }
}
