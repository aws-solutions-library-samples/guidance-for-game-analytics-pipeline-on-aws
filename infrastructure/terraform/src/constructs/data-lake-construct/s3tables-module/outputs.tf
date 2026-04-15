output "game_events_database_name" {
  value       = aws_s3tables_namespace.game_analytics_db.namespace
  description = "The name of the Glue catalog database for game events"
}
output "raw_events_table_name" {
  value = awscc_s3tables_table.event_data_table.table_name
}

output "game_events_database" {
  description = "Glue Catalog Database for storing game analytics events"
  value       = aws_s3tables_namespace.game_analytics_db.namespace
}

output "catalog_arn" {
  description = "The glue catalog ID for the federated s3tables catalog"
  value = "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:catalog/s3tablescatalog/${awscc_s3tables_table_bucket.game_analytics_bucket.table_bucket_name}"
}