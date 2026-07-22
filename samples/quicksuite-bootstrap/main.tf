data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  // read the same config used to deploy the pipeline
  pipeline_config = yamldecode(file("${path.module}/../../infrastructure/config.yaml"))
  samples_config  = yamldecode(file("${path.module}/../config.yaml"))

  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  // The default QuickSight service role ARN looks like:
  //   arn:aws:iam::<account>:role/service-role/aws-quicksight-service-role-v0
  // aws_iam_role_policy_attachment.role expects the role name only.
  quicksight_role_arn  = local.samples_config.QUICKSIGHT_SERVICE_ROLE_ARN
  quicksight_role_name = element(reverse(split("/", local.quicksight_role_arn)), 0)

  analytics_bucket_name = local.samples_config.ANALYTICS_BUCKET_NAME
  athena_workgroup_name = local.samples_config.ATHENA_WORKGROUP_NAME
  analytics_bucket_arn  = "arn:${local.partition}:s3:::${local.analytics_bucket_name}"
  athena_results_prefix = "athena_query_results/*"
}

# Attach AWS-managed AWSQuickSightAthenaAccess to the default service role.
resource "aws_iam_role_policy_attachment" "quicksight_athena_access" {
  role       = local.quicksight_role_name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSQuickSightAthenaAccess"
}

# Inline-equivalent policy granting bucket read and write to the
# athena_query_results/* prefix. 
data "aws_iam_policy_document" "data_source_access_policy" {
  statement {
    sid    = "AnalyticsBucketRead"
    effect = "Allow"
    actions = [
      "s3:GetObject*",
      "s3:GetBucket*",
      "s3:List*",
    ]
    resources = [
      local.analytics_bucket_arn,
      "${local.analytics_bucket_arn}/*",
    ]
  }

  statement {
    sid    = "AthenaQueryResultsWrite"
    effect = "Allow"
    actions = [
      "s3:DeleteObject*",
      "s3:PutObject",
      "s3:PutObjectRetention",
      "s3:PutObjectTagging",
      "s3:PutObjectVersionTagging",
      "s3:Abort*",
    ]
    resources = [
      "${local.analytics_bucket_arn}/${local.athena_results_prefix}",
    ]
  }
}

resource "aws_iam_policy" "data_source_access_policy" {
  name        = "QuickSightGameAnalyticsBucketAccess"
  description = "Grants the QuickSight service role read access to the analytics bucket and write access to the athena_query_results/* prefix."
  policy      = data.aws_iam_policy_document.data_source_access_policy.json
}

resource "aws_iam_role_policy_attachment" "attach_data_source_access_policy" {
  role       = local.quicksight_role_name
  policy_arn = aws_iam_policy.data_source_access_policy.arn
}

# Athena-backed QuickSight data source.
resource "aws_quicksight_data_source" "gap_data_source" {
  data_source_id = "game-analytics-pipeline-data-source"
  name           = "game_analytics_pipeline"
  aws_account_id = local.account_id
  type           = "ATHENA"

  parameters {
    athena {
      work_group = local.athena_workgroup_name
    }
  }

  ssl_properties {
    disable_ssl = false
  }

  depends_on = [
    aws_iam_role_policy_attachment.quicksight_athena_access,
    aws_iam_role_policy_attachment.attach_data_source_access_policy,
  ]
}

locals {
  // QuickSight folder/group ids accept alphanumerics, dashes, and underscores.
  // Sanitize the workload name and cap to 80 chars to stay well under limits.
  workload_name    = local.pipeline_config.WORKLOAD_NAME
  workload_id_safe = substr(replace(lower(local.workload_name), "/[^a-z0-9-_]/", "-"), 0, 80)
  gap_folder_id    = "${local.workload_id_safe}-samples"
  gap_folder_name  = "${local.workload_name} Samples"

  gap_admin_group_name  = "${local.workload_id_safe}-admin"
  gap_writer_group_name = "${local.workload_id_safe}-writer"
  gap_reader_group_name = "${local.workload_id_safe}-reader"

  # QuickSight folder permission action lists by role. Sourced from
  # https://docs.aws.amazon.com/quicksight/latest/user/sharing-folders.html
  gap_folder_owner_actions = [
    "quicksight:CreateFolder",
    "quicksight:DescribeFolder",
    "quicksight:UpdateFolder",
    "quicksight:DeleteFolder",
    "quicksight:CreateFolderMembership",
    "quicksight:DeleteFolderMembership",
    "quicksight:DescribeFolderPermissions",
    "quicksight:UpdateFolderPermissions",
  ]

  gap_folder_contributor_actions = [
    "quicksight:CreateFolder",
    "quicksight:DescribeFolder",
    "quicksight:CreateFolderMembership",
    "quicksight:DeleteFolderMembership",
    "quicksight:DescribeFolderPermissions",
  ]

  gap_folder_viewer_actions = [
    "quicksight:DescribeFolder",
  ]
}

# Three QuickSight groups, one per role, mapping to the QuickSight folder
# permission tiers (owner / contributor / viewer). Add users to the appropriate
# group to grant them that level of access on every asset in the GAP folder.
# Permissions on a QuickSight folder cascade to all assets it contains.
# https://docs.aws.amazon.com/quicksight/latest/user/folders-security.html

# OWNER: full control - manage the folder, its assets, and permissions.
resource "aws_quicksight_group" "gap_admin" {
  group_name  = local.gap_admin_group_name
  description = "GAP samples administrators (folder owners). Members can create, edit, delete, and share assets in the GAP folder, and manage folder permissions."
}

# CONTRIBUTOR: create / edit / delete assets, but cannot delete the folder
# or change permissions.
resource "aws_quicksight_group" "gap_writer" {
  group_name  = local.gap_writer_group_name
  description = "GAP samples contributors. Members can create, edit, and delete assets in the GAP folder."
}

# VIEWER: read-only access to assets in the folder.
resource "aws_quicksight_group" "gap_reader" {
  group_name  = local.gap_reader_group_name
  description = "GAP samples viewers. Members can view assets in the GAP folder."
}

# Folder to store all GAP sample assets (analyses, dashboards, datasets,
# data sources). QuickSight folder permissions cascade to every asset placed
# inside the folder.
resource "aws_quicksight_folder" "gap_folder" {
  folder_id = local.gap_folder_id
  name      = local.gap_folder_name

  permissions {
    principal = aws_quicksight_group.gap_admin.arn
    actions   = local.gap_folder_owner_actions
  }

  permissions {
    principal = aws_quicksight_group.gap_writer.arn
    actions   = local.gap_folder_contributor_actions
  }

  permissions {
    principal = aws_quicksight_group.gap_reader.arn
    actions   = local.gap_folder_viewer_actions
  }
}

# -----------------------------------------------------------------------------
# Output YAML for downstream samples
# -----------------------------------------------------------------------------

locals {
  # Output variables for downstream samples to consume
  bootstrap_output = {
    # QuickSight data source
    GAP_DATA_SOURCE_ARN = aws_quicksight_data_source.gap_data_source.arn
    GAP_DATA_SOURCE_ID  = aws_quicksight_data_source.gap_data_source.data_source_id

    # QuickSight folder
    GAP_FOLDER_ID  = aws_quicksight_folder.gap_folder.folder_id
    GAP_FOLDER_ARN = aws_quicksight_folder.gap_folder.arn

    # QuickSight groups
    GAP_ADMIN_GROUP_ARN   = aws_quicksight_group.gap_admin.arn
    GAP_ADMIN_GROUP_NAME  = aws_quicksight_group.gap_admin.group_name
    GAP_WRITER_GROUP_ARN  = aws_quicksight_group.gap_writer.arn
    GAP_WRITER_GROUP_NAME = aws_quicksight_group.gap_writer.group_name
    GAP_READER_GROUP_ARN  = aws_quicksight_group.gap_reader.arn
    GAP_READER_GROUP_NAME = aws_quicksight_group.gap_reader.group_name
  }
}

# Write output YAML file for downstream samples to read
resource "local_file" "bootstrap_output" {
  content  = yamlencode(local.bootstrap_output)
  filename = "${path.module}/bootstrap-output.yaml"
}
