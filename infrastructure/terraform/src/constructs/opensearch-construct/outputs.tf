
output "opensearch_dashboard_endpoint" {
  value       = "https://application-${awscc_opensearchservice_application.dashboard.name}-${awscc_opensearchservice_application.dashboard.application_id}.${data.aws_region.current.region}.opensearch.amazonaws.com/"
  description = "OpenSearch Dashboard for viewing real-time metrics"
}

output "opensearch_admin_assume_url" {
  value       = "https://signin.aws.amazon.com/switchrole?roleName=${aws_iam_role.opensearch_admin.name}&account=${data.aws_caller_identity.current.account_id}"
  description = "Link to assume the role of an opensearch admin"
}

output "collection_id" {
  value = aws_opensearchserverless_collection.game_analytics_collection.id
}

output "collection_name" {
  value = aws_opensearchserverless_collection.game_analytics_collection.name
}

output "ingestion_pipeline_name" {
  value = aws_osis_pipeline.ingestion.pipeline_name
}