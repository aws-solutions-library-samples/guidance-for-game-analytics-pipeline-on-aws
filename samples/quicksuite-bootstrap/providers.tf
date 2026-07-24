# This is where to configure providers
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0"
    }
  }
}

# Default provider for general AWS resources
provider "aws" {
  region = "us-east-1"
}