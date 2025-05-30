variable "stack_name" {
  type        = string
}

variable "raw_events_table_name" {
    type        = string
}

variable "enable_apache_iceberg_support" {
    type        = string
}

variable "notifications_topic_arn" {
  type = string
}

variable "analytics_bucket_name" {
  type        = string
}

variable "raw_events_prefix" {
  type        = string
}

variable "stack_suffix" {
  type        = string
}