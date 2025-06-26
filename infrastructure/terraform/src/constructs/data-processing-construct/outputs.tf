output "game_events_etl_job" {
  description = "ETL Job for processing game events into optimized format for analytics"
  value       = aws_glue_job.game_events_etl_job.name
}

output "game_events_etl_iceberg_job" {
  description = "ETL Job for processing game events into optimized format for analytics"
  value       = aws_glue_job.game_events_etl_iceberg_job.name
}

output "iceberg_setup_job" {
  description = "Glue Job for setting up new iceberg table"
  value       = var.enable_apache_iceberg_support ? aws_glue_job.iceberg_setup_job[0].name : ""
}
