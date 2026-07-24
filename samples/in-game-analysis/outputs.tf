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

output "in_game_events_table_name" {
  description = "Name of the Glue table for in-game events"
  value       = aws_glue_catalog_table.in_game_events.name
}

output "in_game_trades_table_name" {
  description = "Name of the Glue table for in-game trades"
  value       = aws_glue_catalog_table.in_game_trades.name
}

output "glue_job_name" {
  description = "Name of the Glue ETL job"
  value       = aws_glue_job.in_game_events_etl.name
}

output "glue_job_arn" {
  description = "ARN of the Glue ETL job"
  value       = aws_glue_job.in_game_events_etl.arn
}

output "daily_item_actions_dataset_id" {
  description = "ID of the QuickSight daily item actions dataset"
  value       = aws_quicksight_data_set.daily_item_actions.data_set_id
}

output "daily_item_actions_dataset_arn" {
  description = "ARN of the QuickSight daily item actions dataset"
  value       = aws_quicksight_data_set.daily_item_actions.arn
}

output "daily_item_trades_dataset_id" {
  description = "ID of the QuickSight daily item trades dataset"
  value       = aws_quicksight_data_set.daily_item_trades.data_set_id
}

output "daily_item_trades_dataset_arn" {
  description = "ARN of the QuickSight daily item trades dataset"
  value       = aws_quicksight_data_set.daily_item_trades.arn
}

output "template_id" {
  description = "ID of the QuickSight template"
  value       = aws_quicksight_template.in_game.template_id
}

output "template_arn" {
  description = "ARN of the QuickSight template"
  value       = aws_quicksight_template.in_game.arn
}

output "analysis_id" {
  description = "ID of the QuickSight analysis"
  value       = aws_quicksight_analysis.in_game_events.analysis_id
}

output "analysis_arn" {
  description = "ARN of the QuickSight analysis"
  value       = aws_quicksight_analysis.in_game_events.arn
}
