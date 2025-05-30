output "game_events_database_name" {
  value       = aws_glue_catalog_database.game_events_database.name
  description = "The name of the Glue catalog database for game events"
}

output "athena_workgroup_name" {
  value = aws_athena_workgroup.game_analytics_workgroup.name
}

output "athena_workgroup_id" {
  value = aws_athena_workgroup.game_analytics_workgroup.id
}

output "raw_events_table_name" {
  value = aws_glue_catalog_table.raw_events_table.name
}

output "game_events_database" {
  description = "Glue Catalog Database for storing game analytics events"
  value       = aws_glue_catalog_database.game_events_database.name
}
