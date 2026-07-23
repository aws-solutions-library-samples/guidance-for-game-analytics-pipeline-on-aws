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

  // Determine if data lake mode is enabled (DATA_LAKE) vs Redshift
  is_data_lake_mode = local.pipeline_config.DATA_STACK == "DATA_LAKE"

  // QuickSight folder/group ids accept alphanumerics, dashes, and underscores.
  // Sanitize the workload name and cap to 80 chars to stay well under limits.
  workload_name    = local.pipeline_config.WORKLOAD_NAME
  workload_id_safe = substr(replace(lower(local.workload_name), "/[^a-z0-9-_]/", "-"), 0, 80)
}

# Attach AWS-managed AWSQuickSightAthenaAccess to the default service role.
# Only deployed in data lake mode (DATA_STACK == "DATA_LAKE")
resource "aws_iam_role_policy_attachment" "quicksight_athena_access" {
  count      = local.is_data_lake_mode ? 1 : 0
  role       = local.quicksight_role_name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSQuickSightAthenaAccess"
}

# Inline-equivalent policy granting bucket read and write to the
# athena_query_results/* prefix. 
# Only deployed in data lake mode (DATA_STACK == "DATA_LAKE")
data "aws_iam_policy_document" "data_source_access_policy" {
  count = local.is_data_lake_mode ? 1 : 0

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
  count       = local.is_data_lake_mode ? 1 : 0
  name        = "QuickSightGameAnalyticsBucketAccess"
  description = "Grants the QuickSight service role read access to the analytics bucket and write access to the athena_query_results/* prefix."
  policy      = data.aws_iam_policy_document.data_source_access_policy[0].json
}

resource "aws_iam_role_policy_attachment" "attach_data_source_access_policy" {
  count      = local.is_data_lake_mode ? 1 : 0
  role       = local.quicksight_role_name
  policy_arn = aws_iam_policy.data_source_access_policy[0].arn
}

# Athena-backed QuickSight data source.
# Only deployed in data lake mode (DATA_STACK == "DATA_LAKE")
resource "aws_quicksight_data_source" "gap_data_source_athena" {
  count          = local.is_data_lake_mode ? 1 : 0
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

# -----------------------------------------------------------------------------
# Redshift-specific resources (only when DATA_STACK != "DATA_LAKE")
# -----------------------------------------------------------------------------

# IAM role for QuickSight VPC connection to access Redshift.
# Required for QuickSight to manage network interfaces in the VPC.
data "aws_iam_policy_document" "quicksight_vpc_connection_assume_role" {
  count = local.is_data_lake_mode ? 0 : 1

  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["quicksight.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

# Policy granting access to Secrets Manager, KMS, Redshift Serverless, and EC2 network interfaces.
# Based on qs-redshift-policy.json from the documentation.
data "aws_iam_policy_document" "quicksight_redshift_access" {
  count = local.is_data_lake_mode ? 0 : 1

  statement {
    sid    = "SecretsManagerAccess"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      local.samples_config.REDSHIFT_SECRET_ARN,
    ]
  }

  statement {
    sid    = "KMSDecrypt"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "RedshiftServerlessAccess"
    effect = "Allow"
    actions = [
      "redshift-serverless:GetCredentials",
      "redshift-serverless:GetWorkgroup",
    ]
    resources = [
      "arn:${local.partition}:redshift-serverless:${data.aws_region.current.name}:${local.account_id}:workgroup/*",
    ]
  }

  statement {
    sid    = "EC2NetworkInterfaceAccess"
    effect = "Allow"
    actions = [
      "ec2:CreateNetworkInterface",
      "ec2:ModifyNetworkInterfaceAttribute",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeSubnets",
      "ec2:DescribeSecurityGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "quicksight_vpc_connection" {
  count              = local.is_data_lake_mode ? 0 : 1
  name               = "${local.workload_id_safe}-qs-vpc-role"
  assume_role_policy = data.aws_iam_policy_document.quicksight_vpc_connection_assume_role[0].json
}

resource "aws_iam_role_policy" "quicksight_redshift_access" {
  count  = local.is_data_lake_mode ? 0 : 1
  name   = "${local.workload_id_safe}-quicksight-redshift-access"
  role   = aws_iam_role.quicksight_vpc_connection[0].id
  policy = data.aws_iam_policy_document.quicksight_redshift_access[0].json
}

# Attach the same Redshift access policy to the QuickSight service role.
# This allows QuickSight to read the secret and access Redshift Serverless.
resource "aws_iam_role_policy" "quicksight_service_role_redshift_access" {
  count  = local.is_data_lake_mode ? 0 : 1
  name   = "${local.workload_id_safe}-quicksight-redshift-access"
  role   = local.quicksight_role_name
  policy = data.aws_iam_policy_document.quicksight_redshift_access[0].json
}

# Security group for QuickSight VPC connection (egress-only).
# Placed in the same VPC as the Redshift Serverless workgroup.
data "aws_vpc" "redshift_vpc" {
  count = local.is_data_lake_mode ? 0 : 1
  id    = local.samples_config.REDSHIFT_VPC_ID
}

resource "aws_security_group" "quicksight_vpc_connection" {
  count       = local.is_data_lake_mode ? 0 : 1
  name        = "${local.workload_id_safe}-quicksight-sg"
  description = "QuickSight VPC connection security group"
  vpc_id      = data.aws_vpc.redshift_vpc[0].id

  tags = {
    Name = "${local.workload_name} QuickSight VPC Connection"
  }
}

# QuickSight VPC connection for Redshift access.
# Required for QuickSight to reach Redshift Serverless over private subnets.
resource "aws_quicksight_vpc_connection" "gap_redshift" {
  count              = local.is_data_lake_mode ? 0 : 1
  vpc_connection_id  = "${local.workload_id_safe}-quicksight-vpc"
  name               = "${local.workload_name} QuickSight VPC"
  aws_account_id     = local.account_id
  role_arn           = aws_iam_role.quicksight_vpc_connection[0].arn
  security_group_ids = [aws_security_group.quicksight_vpc_connection[0].id]
  subnet_ids         = local.samples_config.REDSHIFT_SUBNET_IDS
}

# Redshift-backed QuickSight data source.
# Only deployed when DATA_STACK == "REDSHIFT"
# Uses Secrets Manager for authentication (SecretArn) instead of inline credentials.
resource "aws_quicksight_data_source" "gap_data_source_redshift" {
  count          = local.is_data_lake_mode ? 0 : 1
  data_source_id = "game-analytics-pipeline-data-source"
  name           = "game_analytics_pipeline"
  aws_account_id = local.account_id
  type           = "REDSHIFT"

  parameters {
    redshift {
      host     = local.samples_config.REDSHIFT_HOST
      port     = 5431
      database = local.pipeline_config.EVENTS_DATABASE
    }
  }

  credentials {
    secret_arn = local.samples_config.REDSHIFT_SECRET_ARN
  }

  vpc_connection_properties {
    vpc_connection_arn = aws_quicksight_vpc_connection.gap_redshift[0].arn
  }

  ssl_properties {
    disable_ssl = false
  }

  depends_on = [
    aws_quicksight_vpc_connection.gap_redshift,
    aws_security_group.quicksight_vpc_connection,
    aws_iam_role_policy.quicksight_redshift_access,
    aws_iam_role_policy.quicksight_service_role_redshift_access,
  ]
}

locals {
  gap_folder_id   = "${local.workload_id_safe}-samples"
  gap_folder_name = "${local.workload_name} Samples"

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
    # QuickSight data source (Athena for data lake, Redshift otherwise)
    GAP_DATA_SOURCE_ARN = local.is_data_lake_mode ? aws_quicksight_data_source.gap_data_source_athena[0].arn : aws_quicksight_data_source.gap_data_source_redshift[0].arn
    GAP_DATA_SOURCE_ID  = local.is_data_lake_mode ? aws_quicksight_data_source.gap_data_source_athena[0].data_source_id : aws_quicksight_data_source.gap_data_source_redshift[0].data_source_id

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
