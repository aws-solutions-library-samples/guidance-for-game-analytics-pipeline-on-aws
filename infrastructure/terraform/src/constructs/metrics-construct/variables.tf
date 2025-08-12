variable "stack_name" {
  type        = string
}

variable "ingest_mode" {
  type        = string
}

variable "cloudwatch_retention_days" {
  type        = number
}

variable "notifications_topic_arn" {
  type        = string
}

variable "dynamodb_table_names" {
  type        = list(string)
}

variable "api_gateway_name" {
  type        = string
}

variable "firehose_delivery_stream_name" {
  type        = string
}

variable "kinesis_stream_name" {
  type        = string
}

variable "data_platform_mode" {
  type        = string
}

variable "kinesis_metrics_stream_name" {
  type        = string
}

variable "lambda_function_names" {
  type        = list(string)
}