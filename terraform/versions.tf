terraform {
  required_version = ">= 1.10" # use_lockfile

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # 5.80+ for aws_bedrock_guardrail_version and the GuardDuty runtime
      # monitoring feature with ECS Fargate agent management.
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state in the bucket terraform/bootstrap creates, with S3-native
  # locking. Partial on purpose: the bucket name carries the account id, so it
  # is supplied at init (`-backend-config=backend.hcl` locally, from repository
  # variables in CI) rather than written into a public repository.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "agrosense"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront and its WAF web ACL are global resources and AWS only accepts them
# in us-east-1. That is not a preference about where the app runs — everything
# else is in ap-south-1, next to the farmers and the mandi data.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "agrosense"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
