# Data sources
data "aws_partition" "current" {}
data "aws_region" "current" {}

# Variables
variable "stack_name" {
  type          = string
  description   = "Name of the stack"
}

variable "game_events_stream_arn" {
  type = string
  description = "ARN of the Kinesis stream for game events"
}

variable "game_events_stream_name" {
  type = string
  description = "Name of the Kinesis stream for game events"
}

variable "game_events_firehose_arn" {
  type = string
  description = "ARN of the Firehose stream for game events"
}

variable "game_events_firehose_name" {
  type = string
  description = "Name of the Firehose stream for game events"
}

variable "ingest_mode" {
  type = string
  description = "Streaming mode of the ingest"
}

variable "application_admin_service_function_arn" {
  type = string
  description = "ARN of the Lambda function for application admin service"
}

variable "lambda_authorizer_arn" {
  type = string
  description = "ARN of the Lambda function for API authorization"
}

variable "api_stage_name" {
  type = string
  description = "Name of the API stage"
}