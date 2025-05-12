variable "raw_events_table_name" {
    type        = string
}

variable "game_events_database_name" {}
variable "events_processing_function_arn" {}

variable "dev_mode" {
  type = bool
}

variable "ingest_mode" {
  type = string
}

variable "raw_events_prefix" {
  type = string
}

variable "cloudwatch_retention_days" {
    type = number
}

variable "enable_apache_iceberg_support" {
    type = bool
}

variable "game_events_stream_arn" {
  type        = string
}

variable "analytics_bucket_arn" {
  type        = string
}

variable "s3_backup_mode" {
  type        = bool
}

variable "stack_name" {
  type = string
}