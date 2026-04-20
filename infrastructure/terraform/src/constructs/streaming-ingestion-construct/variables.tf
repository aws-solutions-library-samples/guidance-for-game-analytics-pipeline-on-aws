variable "raw_events_table_name" {
  type = string
}

variable "game_events_database_name" {}
variable "events_processing_function_arn" {}

variable "dev_mode" {
  type = bool
}

variable "ingest_mode" {
  type = string
  description = "can be KINESIS_DATA_STREAMS, KAFKA, or DIRECT_BATCH"
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
  type = string
  default = ""
}

variable "analytics_bucket_arn" {
  type = string
}

variable "s3_backup_mode" {
  type = bool
}

variable "stack_name" {
  type = string
}

variable "enable_s3_tables_support" {
  type = bool
  default = false
}

variable "catalog_arn" {
  type = string
  default = ""
}

variable "msk_cluster_arn" {
  type = string
  default = ""
}

variable "msk_topic_name" {
  type = string
  default = ""
}