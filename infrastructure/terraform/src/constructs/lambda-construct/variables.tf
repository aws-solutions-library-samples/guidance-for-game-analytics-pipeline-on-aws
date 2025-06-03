
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