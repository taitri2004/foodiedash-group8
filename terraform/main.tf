terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Uncomment để dùng S3 backend (recommended for team)
  # backend "s3" {
  #   bucket = "foodiedash-terraform-state"
  #   key    = "foodiedash/terraform.tfstate"
  #   region = "us-west-2"
  # }
}

provider "aws" {
  region = var.aws_region
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  name_prefix = "foodiedash"
}

data "aws_caller_identity" "current" {}
