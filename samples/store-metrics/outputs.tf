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
output "item_prices_table_name" {
  description = "Name of the Glue table for item prices"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.item_prices[0].name : null
}

output "daily_item_store_metrics_table_name" {
  description = "Name of the Glue table for daily item store metrics"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.daily_item_store_metrics[0].name : null
}

output "daily_user_purchase_metrics_table_name" {
  description = "Name of the Glue table for daily user purchase metrics"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.daily_user_purchase_metrics[0].name : null
}

output "user_first_join_table_name" {
  description = "Name of the Glue table for user first join timestamps"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.user_first_join[0].name : null
}

output "user_ltv_table_name" {
  description = "Name of the Glue table for user lifetime value"
  value       = local.is_data_lake_mode ? aws_glue_catalog_table.user_ltv[0].name : null
}

# Glue Jobs (DATA_LAKE mode)
output "glue_job_silver_name" {
  description = "Name of the Glue silver layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.store_metrics_silver[0].name : null
}

output "glue_job_silver_arn" {
  description = "ARN of the Glue silver layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.store_metrics_silver[0].arn : null
}

output "glue_job_gold_name" {
  description = "Name of the Glue gold layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.store_metrics_gold[0].name : null
}

output "glue_job_gold_arn" {
  description = "ARN of the Glue gold layer ETL job"
  value       = local.is_data_lake_mode ? aws_glue_job.store_metrics_gold[0].arn : null
}

output "glue_workflow_name" {
  description = "Name of the Glue workflow for daily ETL"
  value       = local.is_data_lake_mode ? aws_glue_workflow.store_metrics_daily[0].name : null
}

# Step Functions (REDSHIFT mode)
output "step_function_state_machine_arn" {
  description = "ARN of the Step Functions state machine for Redshift ETL"
  value       = local.is_data_lake_mode ? null : aws_sfn_state_machine.redshift_store_metrics_etl[0].arn
}

output "step_function_state_machine_name" {
  description = "Name of the Step Functions state machine for Redshift ETL"
  value       = local.is_data_lake_mode ? null : aws_sfn_state_machine.redshift_store_metrics_etl[0].name
}

# QuickSight Datasets
output "daily_item_store_metrics_dataset_id" {
  description = "ID of the QuickSight daily item store metrics dataset"
  value       = aws_quicksight_data_set.daily_item_store_metrics.data_set_id
}

output "daily_item_store_metrics_dataset_arn" {
  description = "ARN of the QuickSight daily item store metrics dataset"
  value       = aws_quicksight_data_set.daily_item_store_metrics.arn
}

output "user_ltv_dataset_id" {
  description = "ID of the QuickSight user LTV dataset"
  value       = aws_quicksight_data_set.user_ltv.data_set_id
}

output "user_ltv_dataset_arn" {
  description = "ARN of the QuickSight user LTV dataset"
  value       = aws_quicksight_data_set.user_ltv.arn
}

# QuickSight Template
output "template_id" {
  description = "ID of the QuickSight template"
  value       = aws_quicksight_template.store_metrics.template_id
}

output "template_arn" {
  description = "ARN of the QuickSight template"
  value       = aws_quicksight_template.store_metrics.arn
}

# QuickSight Analysis
output "analysis_id" {
  description = "ID of the QuickSight analysis"
  value       = aws_quicksight_analysis.store_metrics.analysis_id
}

output "analysis_arn" {
  description = "ARN of the QuickSight analysis"
  value       = aws_quicksight_analysis.store_metrics.arn
}
