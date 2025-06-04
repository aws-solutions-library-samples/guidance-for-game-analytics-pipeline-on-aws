
variable "ingest_mode" {
  type        = string
}

variable "data_platform_mode" {
  type        = string
}

variable "events_database" {
  type        = string
}

variable "applications_table_name" {
  type        = string
  description = "Name of the DynamoDB table for applications"
}

variable "authorizations_table_name" {
  type        = string
  description = "Name of the DynamoDB table for authorizations"
}

variable "stack_name" {
  type        = string
}

variable "redshift_enabled" {
  type        = bool
}

variable "redshift_namespace_name" {
  type        = list(string)
}

variable "redshift_key_arn" {
  type        = list(string)
}

variable "redshift_workgroup_name" {
  type        = list(string)
}

variable "redshift_role_arn" {
  type        = list(string)
}

variable "games_events_stream_name" {
  type        = list(string)
}