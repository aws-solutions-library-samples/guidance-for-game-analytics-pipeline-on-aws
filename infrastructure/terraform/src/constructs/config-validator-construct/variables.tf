variable "data_platform_mode" {
  type        = string
  description = "The data stack to use (REDSHIFT or DATA_LAKE)"

  validation {
    condition     = var.data_platform_mode == "REDSHIFT" || var.data_platform_mode == "DATA_LAKE"
    error_message = "The data_platform_mode must be either 'REDSHIFT' or 'DATA_LAKE'."
  }
}

variable "ingest_mode" {
  type        = string
  description = "The data ingest mode to use (DIRECT_BATCH or KINESIS_DATA_STREAMS)"
  default     = "KINESIS_DATA_STREAMS"

  validation {
    condition     = var.ingest_mode == "DIRECT_BATCH" || var.ingest_mode == "KINESIS_DATA_STREAMS"
    error_message = "The ingest_mode must be either 'DIRECT_BATCH' or 'KINESIS_DATA_STREAMS'."
  }
}

variable "real_time_analytics" {
  type        = bool
  description = "Whether to enable real-time analytics"
  default     = true

  validation {
    condition     = var.real_time_analytics == true || var.real_time_analytics == false
    error_message = "The real_time_analytics variable must be a boolean value (true or false)."
  }
}
