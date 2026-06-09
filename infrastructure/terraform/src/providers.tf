# This is where to configure providers
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.98"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}