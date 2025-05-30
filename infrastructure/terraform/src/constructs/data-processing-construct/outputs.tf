output "game_events_etl_job" {
  description = "ETL Job for processing game events into optimized format for analytics"
  value       = aws_glue_job.game_events_etl_job.name
}