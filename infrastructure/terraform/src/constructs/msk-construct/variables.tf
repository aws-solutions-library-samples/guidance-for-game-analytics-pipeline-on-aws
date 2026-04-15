variable "stack_name" {
  type        = string
  description = "Name of the stack"

  validation {
    condition     = length(var.stack_name) > 0 && length(var.stack_name) <= 64
    error_message = "stack_name must be between 1 and 64 characters."
  }

  validation {
    condition     = can(regex("^[a-zA-Z0-9_-]+$", var.stack_name))
    error_message = "stack_name may only contain alphanumeric characters, hyphens, and underscores."
  }
}

variable "vpc_id" {
  type        = string
  description = "The ID of the VPC where the MSK cluster will be deployed"

  validation {
    condition     = can(regex("^vpc-[a-f0-9]+$", var.vpc_id))
    error_message = "vpc_id must be a valid VPC ID (e.g. vpc-0abc1234def56789a)."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "The CIDR block of the VPC, used for security group ingress rules"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid CIDR block (e.g. 10.0.0.0/16)."
  }
}

variable "vpc_subnet" {
  type        = list(string)
  description = "A list of subnets within the VPC where the MSK cluster will be deployed"

  validation {
    condition     = length(var.vpc_subnet) >= 2
    error_message = "At least 2 subnets are required for MSK broker placement."
  }

  validation {
    condition     = alltrue([for s in var.vpc_subnet : can(regex("^subnet-[a-f0-9]+$", s))])
    error_message = "All entries must be valid subnet IDs (e.g. subnet-0abc1234def56789a)."
  }
}

variable "cluster_name" {
  type        = string
  description = "Name of the MSK cluster. Defaults to stack_name-cluster if not set."
  default     = null

  validation {
    condition     = var.cluster_name == null || can(regex("^[a-zA-Z0-9-]+$", var.cluster_name))
    error_message = "cluster_name may only contain alphanumeric characters and hyphens."
  }
}

variable "cluster_instance_type" {
  type        = string
  default     = "express.m7g.8xlarge"
  description = "The instance type for MSK broker nodes"

  validation {
    condition     = can(regex("^express\\.", var.cluster_instance_type))
    error_message = "cluster_instance_type must start with 'express.' (e.g. express.m7g.8xlarge). Only Express broker types are allowed."
  }
}

variable "topic_name" {
  type        = string
  default     = "game_events"
  description = "The name of the Kafka topic to create"

  validation {
    condition     = length(var.topic_name) > 0 && length(var.topic_name) <= 249
    error_message = "topic_name must be between 1 and 249 characters."
  }

  validation {
    condition     = can(regex("^[a-zA-Z0-9._-]+$", var.topic_name))
    error_message = "topic_name may only contain alphanumeric characters, dots, hyphens, and underscores."
  }
}

variable "partition_count" {
  type        = number
  default     = 100
  description = "Number of partitions for the Kafka topic"

  validation {
    condition     = var.partition_count >= 1 && var.partition_count <= 10000
    error_message = "partition_count must be between 1 and 10000."
  }
}
