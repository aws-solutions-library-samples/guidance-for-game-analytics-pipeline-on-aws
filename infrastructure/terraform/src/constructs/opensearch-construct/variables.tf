variable "metric_output_stream_arn" {
    type        = string
}

variable "metric_output_stream_name" {
    type        = string
}

variable "dev_mode" {
  type = bool
}

variable "stack_name" {
  type = string
}

variable "cloudwatch_retention_days" {
    type = number
}

locals {
  collection_name = substr(lower(replace(lower(var.stack_name), "/[^a-z0-9-]+/", "")), 0, 28)
  pipeline_name = substr(lower(replace("${lower(var.stack_name)}-ingestion", "/[^a-z0-9-]+/", "")), 0, 28)
}