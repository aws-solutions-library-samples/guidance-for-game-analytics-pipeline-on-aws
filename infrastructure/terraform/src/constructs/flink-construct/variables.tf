variable "stack_name" {
  type        = string
}

variable "stream_shard_count" {
  type        = number
}

variable "cloudwatch_retention_days" {
  type        = number
}

variable "analytics_bucket_name" {
  type        = string
}

variable "analytics_bucket_arn" {
  type        = string
}

variable "game_events_stream_arn" {
  type        = string
}

variable "game_events_stream_name" {
  type        = string
}

variable "flink_deploy_artifact" {
  type        = string
  default     = "deploy.zip"
}

variable "suffix" {
  type = string
}