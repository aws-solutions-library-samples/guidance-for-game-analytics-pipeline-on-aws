variable "events_database" {
  type = string
}

variable "game_events_workgroup" {
  type = string
}

variable "raw_events_table" {
  type = string
}

variable "enable_apache_iceberg_support" {
  type        = bool
  description = "When true, deploy queries targeting the Iceberg schema (native event_timestamp). When false, deploy legacy Hive-partitioned queries (year/month/day partition columns)."
}