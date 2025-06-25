
output "opensearch_dashboard_endpoint" {
  value       = "https://application-${awscc_opensearchservice_application.dashboard.name}-${awscc_opensearchservice_application.dashboard.application_id}.${data.aws_region.current.name}.opensearch.amazonaws.com/"
  description = "OpenSearch Dashboard for viewing real-time metrics"
}