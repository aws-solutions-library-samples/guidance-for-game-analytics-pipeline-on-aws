# Variables
variable "stack_name" {
  type          = string
  description   = "Name of the stack"
}

variable "workload_name" {
  type          = string
  description   = "Name of the workload"
}

variable "ingest_mode" {
  type = string
  description = "Streaming mode of the ingest"
}

variable "game_events_stream_name" {
  type = string
  description = "Name of the Kinesis stream for game events"
}

variable "metrics_stream_name" {
  type = string
  description = "Name of the Kinesis stream for game events"
}

variable "game_events_firehose_name" {
  type = string
  description = "Name of the Firehose stream for game events"
}

variable "events_processing_function" {
  type        = string
}

variable "analytics_processing_function" {
  type        = string
}

variable "api_gateway_name" {
  type        = string
}

variable "api_stage_name" {
  type = string
}

variable "flink_app" {
  type = string
}

variable "redshift_namespace_db_name" {
  type = string
}

variable "redshift_workgroup_name" {
  type = string
}