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