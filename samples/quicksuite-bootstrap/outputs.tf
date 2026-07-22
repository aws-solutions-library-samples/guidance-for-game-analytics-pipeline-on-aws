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

output "gap_data_source_arn" {
  description = "ARN of the QuickSight Athena data source"
  value       = aws_quicksight_data_source.gap_data_source.arn
}

output "gap_data_source_id" {
  description = "ID of the QuickSight Athena data source"
  value       = aws_quicksight_data_source.gap_data_source.data_source_id
}

output "gap_folder_id" {
  description = "ID of the QuickSight folder for GAP samples"
  value       = aws_quicksight_folder.gap_folder.folder_id
}

output "gap_folder_arn" {
  description = "ARN of the QuickSight folder for GAP samples"
  value       = aws_quicksight_folder.gap_folder.arn
}

output "gap_admin_group_name" {
  description = "Name of the GAP admin group (folder owner)"
  value       = aws_quicksight_group.gap_admin.group_name
}

output "gap_admin_group_arn" {
  description = "ARN of the GAP admin group"
  value       = aws_quicksight_group.gap_admin.arn
}

output "gap_writer_group_name" {
  description = "Name of the GAP writer group (folder contributor)"
  value       = aws_quicksight_group.gap_writer.group_name
}

output "gap_writer_group_arn" {
  description = "ARN of the GAP writer group"
  value       = aws_quicksight_group.gap_writer.arn
}

output "gap_reader_group_name" {
  description = "Name of the GAP reader group (folder viewer)"
  value       = aws_quicksight_group.gap_reader.group_name
}

output "gap_reader_group_arn" {
  description = "ARN of the GAP reader group"
  value       = aws_quicksight_group.gap_reader.arn
}

output "bootstrap_output_file" {
  description = "Path to the bootstrap output YAML file"
  value       = local_file.bootstrap_output.filename
}
