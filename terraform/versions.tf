terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Uncomment once the bootstrap bucket exists. Left commented so the first
  # `terraform init` works with no prior AWS state anywhere — a remote backend
  # that does not exist yet is the classic reason a fresh clone cannot plan.
  #
  # backend "s3" {
  #   bucket       = "agrosense-tfstate"
  #   key          = "agrosense/terraform.tfstate"
  #   region       = "ap-south-1"
  #   encrypt      = true
  #   use_lockfile = true          # S3-native locking; no DynamoDB table needed
  # }
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
