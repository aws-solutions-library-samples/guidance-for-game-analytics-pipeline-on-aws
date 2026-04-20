output "game_events_database_name" {
  value = var.enable_s3_tables_support ? module.s3tables[0].game_events_database_name : aws_glue_catalog_database.game_events_database[0].name
  description = "The name of the Glue catalog database for game events"
}

output "athena_workgroup_name" {
  value = aws_athena_workgroup.game_analytics_workgroup.name
}

output "athena_workgroup_id" {
  value = aws_athena_workgroup.game_analytics_workgroup.id
}

output "raw_events_table_name" {
  value = var.enable_s3_tables_support ? module.s3tables[0].raw_events_table_name : aws_glue_catalog_table.raw_events_table[0].name
}

output "game_events_database" {
  description = "Glue Catalog Database for storing game analytics events"
  value = var.enable_s3_tables_support ? module.s3tables[0].game_events_database : aws_glue_catalog_database.game_events_database[0].name
}

output "catalog_arn" {
  description = "The glue catalog ID for the federated s3tables catalog (only available when s3 tables support is enabled)"
  value       = var.enable_s3_tables_support ? module.s3tables[0].catalog_arn : null
}
