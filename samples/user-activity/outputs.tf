/**
 * Copyright 2023 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the 'License').
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the 'license' file accompanying this file. This file is distributed
 * on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

# Glue Tables (DATA_LAKE mode)
output "user_status_table_name" {
  description = "Name of the Glue table for user status tracking"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.user_status[0].name : null
}

output "user_status_transition_table_name" {
  description = "Name of the Glue table for user status transitions"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.user_status_transition[0].name : null
}

output "user_counts_table_name" {
  description = "Name of the Glue table for daily user counts by status"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.user_counts[0].name : null
}

output "user_first_join_table_name" {
  description = "Name of the Glue table for user first join timestamps"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.user_first_join[0].name : null
}

output "sessions_table_name" {
  description = "Name of the Glue table for user sessions"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.sessions[0].name : null
}

output "daily_session_stats_table_name" {
  description = "Name of the Glue table for daily session statistics"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.daily_session_stats[0].name : null
}

# Glue Jobs (DATA_LAKE mode)
output "glue_job_silver_name" {
  description = "Name of the Glue silver layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.user_activity_silver[0].name : null
}

output "glue_job_silver_arn" {
  description = "ARN of the Glue silver layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.user_activity_silver[0].arn : null
}

output "glue_job_gold_name" {
  description = "Name of the Glue gold layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.user_activity_gold[0].name : null
}

output "glue_job_gold_arn" {
  description = "ARN of the Glue gold layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.user_activity_gold[0].arn : null
}

output "glue_workflow_name" {
  description = "Name of the Glue workflow for daily ETL"
  value       = local.is_data_lake_mode ? aws_glue_workflow.user_activity_daily[0].name : null
}

# Step Functions (REDSHIFT mode)
output "step_function_state_machine_arn" {
  description = "ARN of the Step Functions state machine for Redshift ETL"
  value       = local.is_data_lake_mode ? null : aws_sfn_state_machine.redshift_user_activity_etl[0].arn
}

output "step_function_state_machine_name" {
  description = "Name of the Step Functions state machine for Redshift ETL"
  value       = local.is_data_lake_mode ? null : aws_sfn_state_machine.redshift_user_activity_etl[0].name
}

# QuickSight Datasets
output "user_status_dataset_id" {
  description = "ID of the QuickSight user status dataset"
  value       = aws_quicksight_data_set.user_status.data_set_id
}

output "user_status_dataset_arn" {
  description = "ARN of the QuickSight user status dataset"
  value       = aws_quicksight_data_set.user_status.arn
}

output "daily_session_stats_dataset_id" {
  description = "ID of the QuickSight daily session stats dataset"
  value       = aws_quicksight_data_set.daily_session_stats.data_set_id
}

output "daily_session_stats_dataset_arn" {
  description = "ARN of the QuickSight daily session stats dataset"
  value       = aws_quicksight_data_set.daily_session_stats.arn
}

# QuickSight Template
output "template_id" {
  description = "ID of the QuickSight template"
  value       = aws_quicksight_template.playerbase_overview.template_id
}

output "template_arn" {
  description = "ARN of the QuickSight template"
  value       = aws_quicksight_template.playerbase_overview.arn
}

# QuickSight Analysis
output "analysis_id" {
  description = "ID of the QuickSight analysis"
  value       = aws_quicksight_analysis.playerbase_overview.analysis_id
}

output "analysis_arn" {
  description = "ARN of the QuickSight analysis"
  value       = aws_quicksight_analysis.playerbase_overview.arn
}
