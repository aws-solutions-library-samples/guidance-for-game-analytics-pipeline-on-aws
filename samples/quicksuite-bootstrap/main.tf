data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  # read the same config used to deploy the pipeline
  pipeline_config = yamldecode(file("${path.module}/../../infrastructure/config.yaml"))
  samples_config  = yamldecode(file("${path.module}/../config.yaml"))

  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  gap_region = local.samples_config.GAME_ANALYTICS_PIPELINE_REGION

  # The default QuickSight service role ARN looks like:
  #   arn:aws:iam::<account>:role/service-role/aws-quicksight-service-role-v0
  # aws_iam_role_policy_attachment.role expects the role name only.
  quicksight_role_arn  = local.samples_config.QUICKSIGHT_SERVICE_ROLE_ARN
  quicksight_role_name = element(reverse(split("/", local.quicksight_role_arn)), 0)

  # The QuickSight Secrets Manager role ARN (required for Redshift mode).
  # This role is created when you grant QuickSight access to Secrets Manager.
  # Role name: aws-quicksight-secretsmanager-role-v0
  quicksight_secrets_manager_role_arn  = local.samples_config.QUICKSIGHT_SECRETS_MANAGER_ROLE_ARN
  quicksight_secrets_manager_role_name = local.quicksight_secrets_manager_role_arn != null ? element(reverse(split("/", local.quicksight_secrets_manager_role_arn)), 0) : null

  analytics_bucket_name = local.samples_config.ANALYTICS_BUCKET_NAME
  athena_workgroup_name = local.samples_config.ATHENA_WORKGROUP_NAME
  analytics_bucket_arn  = "arn:${local.partition}:s3:::${local.analytics_bucket_name}"
  athena_results_prefix = "athena_query_results/*"

  # Determine if data lake mode is enabled (DATA_LAKE) vs Redshift
  is_data_lake_mode = local.pipeline_config.DATA_STACK == "DATA_LAKE"

  # Athena data source is only valid when in data lake mode AND workgroup is configured
  create_athena_data_source = local.is_data_lake_mode && local.athena_workgroup_name != null && local.athena_workgroup_name != ""

  # QuickSight folder/group ids accept alphanumerics, dashes, and underscores.
  # Sanitize the workload name and cap to 80 chars to stay well under limits.
  workload_name    = local.pipeline_config.WORKLOAD_NAME
  workload_id_safe = substr(replace(lower(local.workload_name), "/[^a-z0-9-_]/", "-"), 0, 80)

  # QuickSight identity region - the region where your QuickSight account was created.
  # Groups must be created in this region. Find your identity region by:
  #   1. Check the QuickSight console URL (e.g., us-west-2.quicksight.aws.amazon.com)
  #   2. Or run: aws quicksight describe-account-settings --aws-account-id <account-id>
  # Set this in samples/config.yaml as QUICKSIGHT_IDENTITY_REGION
  quicksight_identity_region = local.samples_config.QUICKSIGHT_IDENTITY_REGION
}

# -----------------------------------------------------------------------------
# Preflight checks
# -----------------------------------------------------------------------------
#
# The aws-quicksight-service-role-v0 (and aws-quicksight-secretsmanager-role-v0)
# roles are NOT created by any QuickSight or IAM API call. AWS only creates them
# the first time an account administrator opens the QuickSight console and
# either accepts the default "QuickSight-managed role" or explicitly picks a
# role on the Security & permissions page. See:
#   https://docs.aws.amazon.com/quicksight/latest/user/security-create-iam-role-prerequisites.html
#
# If that step hasn't happened yet, CreateDataSource fails deep into `terraform
# apply` with the opaque error:
#   "The QuickSight service role required to access your AWS resources has not
#    been created yet."
#
# aws_iam_roles (plural) returns an empty list instead of erroring when no role
# matches, so we can use it plus a postcondition to fail fast with a clear,
# actionable message instead.
data "aws_iam_roles" "quicksight_service_role_check" {
  name_regex = "^${local.quicksight_role_name}$"

  lifecycle {
    postcondition {
      condition     = length(self.names) > 0
      error_message = "The QuickSight service role '${local.quicksight_role_name}' does not exist yet. This role is only created by AWS the first time an administrator signs in to the QuickSight console and confirms/selects a role on the 'Manage QuickSight > Security & permissions' page - it cannot be created via Terraform or the AWS CLI/API. Sign in to QuickSight (https://quicksight.aws.amazon.com/) once in this account/region, then re-run terraform apply."
    }
  }
}

data "aws_iam_roles" "quicksight_secrets_manager_role_check" {
  count      = local.is_data_lake_mode ? 0 : 1
  name_regex = "^${local.quicksight_secrets_manager_role_name}$"

  lifecycle {
    postcondition {
      condition     = length(self.names) > 0
      error_message = "The QuickSight Secrets Manager role '${local.quicksight_secrets_manager_role_name}' does not exist yet. This role is only created by AWS when an administrator grants QuickSight access to Secrets Manager from the console (Manage QuickSight > Security & permissions > Secrets Manager). It cannot be created via Terraform or the AWS CLI/API. Grant that access once in the console, then re-run terraform apply. See https://docs.aws.amazon.com/quicksight/latest/user/secrets-manager-integration.html"
    }
  }
}

# Attach AWS-managed AWSQuickSightAthenaAccess to the default service role.
# Only deployed in data lake mode (DATA_STACK == "DATA_LAKE")
resource "aws_iam_role_policy_attachment" "quicksight_athena_access" {
  count      = local.create_athena_data_source ? 1 : 0
  role       = local.quicksight_role_name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AWSQuickSightAthenaAccess"

  depends_on = [data.aws_iam_roles.quicksight_service_role_check]
}

# Inline-equivalent policy granting bucket read and write to the
# athena_query_results/* prefix. 
# Only deployed in data lake mode (DATA_STACK == "DATA_LAKE")
data "aws_iam_policy_document" "data_source_access_policy" {
  count = local.create_athena_data_source ? 1 : 0

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
  count       = local.create_athena_data_source ? 1 : 0
  name        = "QuickSightGameAnalyticsBucketAccess"
  description = "Grants the QuickSight service role read access to the analytics bucket and write access to the athena_query_results/* prefix."
  policy      = data.aws_iam_policy_document.data_source_access_policy[0].json
}

resource "aws_iam_role_policy_attachment" "attach_data_source_access_policy" {
  count      = local.create_athena_data_source ? 1 : 0
  role       = local.quicksight_role_name
  policy_arn = aws_iam_policy.data_source_access_policy[0].arn
}

# Athena-backed QuickSight data source.
# Only deployed in data lake mode (DATA_STACK == "DATA_LAKE") with valid workgroup
resource "aws_quicksight_data_source" "gap_data_source_athena" {
  count = local.create_athena_data_source ? 1 : 0

  data_source_id = "game-analytics-pipeline-data-source"
  name           = "game_analytics_pipeline"
  aws_account_id = local.account_id
  type           = "ATHENA"

  parameters {
    athena {
      work_group = coalesce(local.athena_workgroup_name, "primary")
    }
  }

  ssl_properties {
    disable_ssl = false
  }

  permission {
    principal = aws_quicksight_group.gap_admin.arn
    actions   = local.gap_data_source_read_actions
  }

  permission {
    principal = aws_quicksight_group.gap_writer.arn
    actions   = local.gap_data_source_read_actions
  }

  permission {
    principal = aws_quicksight_group.gap_reader.arn
    actions   = local.gap_data_source_read_actions
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
      "arn:${local.partition}:redshift-serverless:${local.gap_region}:${local.account_id}:workgroup/*",
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

  depends_on = [data.aws_iam_roles.quicksight_service_role_check]
}

# Attach Secrets Manager access policy to the QuickSight Secrets Manager role.
# This role is used when creating data sources with secret credentials.
# The role aws-quicksight-secretsmanager-role-v0 is created by QuickSight
# when you grant QuickSight access to Secrets Manager via the console.
resource "aws_iam_role_policy" "quicksight_secrets_manager_role_access" {
  count  = local.is_data_lake_mode ? 0 : 1
  name   = "${local.workload_id_safe}-quicksight-secrets-access"
  role   = local.quicksight_secrets_manager_role_name
  policy = data.aws_iam_policy_document.quicksight_redshift_access[0].json

  depends_on = [data.aws_iam_roles.quicksight_secrets_manager_role_check]
}

# Security group for QuickSight VPC connection (egress-only).
# Placed in the same VPC as the Redshift Serverless workgroup.
data "aws_vpc" "redshift_vpc" {
  region = local.gap_region
  count  = local.is_data_lake_mode ? 0 : 1
  id     = local.samples_config.REDSHIFT_VPC_ID
}

resource "aws_security_group" "quicksight_vpc_connection" {
  region      = local.gap_region
  count       = local.is_data_lake_mode ? 0 : 1
  name        = "${local.workload_id_safe}-quicksight-sg"
  description = "QuickSight VPC connection security group"
  vpc_id      = data.aws_vpc.redshift_vpc[0].id

  # NOTE: aws_security_group manages rules exhaustively. AWS auto-creates a
  # default "allow all outbound" egress rule on every new security group, but
  # Terraform removes it if no egress block is declared here. Without this,
  # the ENIs QuickSight creates for the VPC connection have no egress rules at
  # all, so QuickSight can never reach the Redshift Serverless workgroup and
  # CreateDataSource fails with GENERIC_SQL_FAILURE: The connection attempt
  # failed. Scope egress to the VPC CIDR on the Redshift port instead of
  # allowing all outbound, since QuickSight only needs to reach Redshift here.
  egress {
    description = "Allow outbound to Redshift Serverless in the VPC"
    from_port   = 5431
    to_port     = 5431
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.redshift_vpc[0].cidr_block]
  }

  tags = {
    Name = "${local.workload_name} QuickSight VPC Connection"
  }
}

# QuickSight VPC connection for Redshift access.
# Required for QuickSight to reach Redshift Serverless over private subnets.
resource "aws_quicksight_vpc_connection" "gap_redshift" {
  region             = local.gap_region
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
  region         = local.gap_region
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

  permission {
    principal = aws_quicksight_group.gap_admin.arn
    actions   = local.gap_data_source_read_actions
  }

  permission {
    principal = aws_quicksight_group.gap_writer.arn
    actions   = local.gap_data_source_read_actions
  }

  permission {
    principal = aws_quicksight_group.gap_reader.arn
    actions   = local.gap_data_source_read_actions
  }

  depends_on = [
    aws_quicksight_vpc_connection.gap_redshift,
    aws_security_group.quicksight_vpc_connection,
    aws_iam_role_policy.quicksight_redshift_access,
    aws_iam_role_policy.quicksight_service_role_redshift_access,
    aws_iam_role_policy.quicksight_secrets_manager_role_access,
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

  # Read-only actions granted on the QuickSight data source to all three GAP
  # groups. PassDataSource is required so members can build datasets/analyses
  # on top of the data source, not just view its definition.
  gap_data_source_read_actions = [
    "quicksight:DescribeDataSource",
    "quicksight:DescribeDataSourcePermissions",
    "quicksight:PassDataSource",
  ]
}

# Three QuickSight groups, one per role, mapping to the QuickSight folder
# permission tiers (owner / contributor / viewer). Add users to the appropriate
# group to grant them that level of access on every asset in the GAP folder.
# Permissions on a QuickSight folder cascade to all assets it contains.
# https://docs.aws.amazon.com/quicksight/latest/user/folders-security.html

# OWNER: full control - manage the folder, its assets, and permissions.
resource "aws_quicksight_group" "gap_admin" {
  group_name     = local.gap_admin_group_name
  description    = "GAP samples administrators (folder owners). Members can create, edit, delete, and share assets in the GAP folder, and manage folder permissions."
  aws_account_id = local.account_id
  region         = local.quicksight_identity_region
}

# CONTRIBUTOR: create / edit / delete assets, but cannot delete the folder
# or change permissions.
resource "aws_quicksight_group" "gap_writer" {
  group_name     = local.gap_writer_group_name
  description    = "GAP samples contributors. Members can create, edit, and delete assets in the GAP folder."
  aws_account_id = local.account_id
  region         = local.quicksight_identity_region
}

# VIEWER: read-only access to assets in the folder.
resource "aws_quicksight_group" "gap_reader" {
  group_name     = local.gap_reader_group_name
  description    = "GAP samples viewers. Members can view assets in the GAP folder."
  aws_account_id = local.account_id
  region         = local.quicksight_identity_region
}

# Folder to store all GAP sample assets (analyses, dashboards, datasets,
# data sources). QuickSight folder permissions cascade to every asset placed
# inside the folder.
resource "aws_quicksight_folder" "gap_folder" {
  region         = local.gap_region
  folder_id      = local.gap_folder_id
  name           = local.gap_folder_name
  aws_account_id = local.account_id

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
    GAP_DATA_SOURCE_ARN = local.create_athena_data_source ? aws_quicksight_data_source.gap_data_source_athena[0].arn : aws_quicksight_data_source.gap_data_source_redshift[0].arn
    GAP_DATA_SOURCE_ID  = local.create_athena_data_source ? aws_quicksight_data_source.gap_data_source_athena[0].data_source_id : aws_quicksight_data_source.gap_data_source_redshift[0].data_source_id

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
