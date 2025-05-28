variable "ingest_mode" {
  type = string
}

variable "data_platform_mode" {
  type = string
  
  validation {
    condition = !(var.data_platform_mode == "REDSHIFT" && var.ingest_mode == "DIRECT_BATCH")
    error_message = "REDSHIFT mode does not support DIRECT_BATCH, please see documentation (Design Considerations) for details."
  }
}

variable "real_time_analytics" {
  type = string
  
  validation {
    condition = !(var.real_time_analytics == true && var.ingest_mode == "KINESIS_DATA_STREAMS")
    error_message = "REAL TIME ANALYTICS requires KINESIS DATA STREAMS as real time ingest."
  }
}