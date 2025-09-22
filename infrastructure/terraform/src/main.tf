data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  config = yamldecode(file("${path.module}/../../config.yaml"))
}

module "config-validator" {
  source = "./constructs/config-validator-construct"
  ingest_mode=local.config.INGEST_MODE
  data_platform_mode=local.config.DATA_STACK
  real_time_analytics=local.config.REAL_TIME_ANALYTICS
}

resource "random_string" "stack-random-id-suffix" {
  length  = 8
  special = false
  upper   = false
}

// ---- S3 Buckets ---- //

// Solutions Logs Bucket
resource "aws_s3_bucket" "solution_logs_bucket" {
  bucket = lower("${local.config.WORKLOAD_NAME}-solutionlogsbucket-${random_string.stack-random-id-suffix.result}")
  force_destroy = false
  lifecycle {
    prevent_destroy = false
  }
}

resource "aws_s3_bucket_ownership_controls" "solution_logs_bucket" {
  bucket = aws_s3_bucket.solution_logs_bucket.id
  rule {
    object_ownership = "ObjectWriter"
  }
}

resource "aws_s3_bucket_versioning" "solution_logs_bucket" {
  bucket = aws_s3_bucket.solution_logs_bucket.id
  versioning_configuration {
    status = local.config.DEV_MODE ? "Disabled" : "Enabled"
  }
}

resource "aws_s3_bucket_acl" "solution_logs_bucket" {
  depends_on = [aws_s3_bucket_ownership_controls.solution_logs_bucket]
  bucket = aws_s3_bucket.solution_logs_bucket.id
  acl    = "log-delivery-write"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "solution_logs_bucket" {
  bucket = aws_s3_bucket.solution_logs_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "solution_logs_bucket" {
  bucket = aws_s3_bucket.solution_logs_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "solution_logs_bucket" {
  bucket = aws_s3_bucket.solution_logs_bucket.id

  rule {
    filter {
      prefix = ""
    }
    id = "S3StandardInfrequentAccess"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
  }
}

// Core bucket for the solution, holds all pre and post processed analytics data, athena and glue are backed by this bucket as well
resource "aws_s3_bucket" "analytics_bucket" {
  bucket = lower("${local.config.WORKLOAD_NAME}-analyticsbucket-${random_string.stack-random-id-suffix.result}")
  force_destroy = false
  lifecycle {
    prevent_destroy = false
  }
}

resource "aws_s3_bucket_ownership_controls" "analytics_bucket" {
  bucket = aws_s3_bucket.analytics_bucket.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "analytics_bucket" {
  bucket = aws_s3_bucket.analytics_bucket.id
  versioning_configuration {
    status = local.config.DEV_MODE ? "Disabled" : "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "analytics_bucket" {
  bucket = aws_s3_bucket.analytics_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "analytics_bucket" {
  bucket = aws_s3_bucket.analytics_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "analytics_bucket" {
  bucket = aws_s3_bucket.analytics_bucket.id

  target_bucket = aws_s3_bucket.solution_logs_bucket.id
  target_prefix = "AnalyticsBucket/"
}

resource "aws_s3_bucket_lifecycle_configuration" "analytics_bucket" {
  bucket = aws_s3_bucket.analytics_bucket.id

  rule {
    id = "S3IntelligentTiering7DaysRaw"
    status = "Enabled"

    transition {
      days          = 7
      storage_class = "INTELLIGENT_TIERING"
    }

    noncurrent_version_transition {
      noncurrent_days = 7
      storage_class   = "INTELLIGENT_TIERING"
    }

    filter {
      prefix = local.config.RAW_EVENTS_PREFIX
    }
  }

  rule {
    id = "S3IntelligentTiering7DaysProcessed"
    status = "Enabled"

    transition {
      days          = 7
      storage_class = "INTELLIGENT_TIERING"
    }

    noncurrent_version_transition {
      noncurrent_days = 7
      storage_class   = "INTELLIGENT_TIERING"
    }

    filter {
      prefix = local.config.PROCESSED_EVENTS_PREFIX
    }
  }

  rule {
    id = "S3IntelligentTiering7DaysErrors"
    status = "Enabled"

    transition {
      days          = 7
      storage_class = "INTELLIGENT_TIERING"
    }

    noncurrent_version_transition {
      noncurrent_days = 7
      storage_class   = "INTELLIGENT_TIERING"
    }

    filter {
      prefix = "firehose-errors/"
    }
  }
}

/* The following resources copies the Glue ETL scripts to S3. */
resource "aws_s3_object" "copy_glue_etl_script_to_s3" {
  for_each = fileset("${path.module}/../../../business-logic/data-lake/glue-scripts/", "*")
  bucket = aws_s3_bucket.analytics_bucket.id
  key    = "/glue-scripts/${each.value}"
  source = "${path.module}/../../../business-logic/data-lake/glue-scripts/${each.value}"
  etag   = filemd5("${path.module}/../../../business-logic/data-lake/glue-scripts/${each.value}")
}

// ---- Metrics & Alarms ---- //

// Encryption keys
resource "aws_kms_key" "sns_encryption_key" {
  description             = "KMS Key for encrypting SNS"
  enable_key_rotation     = true
  deletion_window_in_days = 7

  policy = <<POLICY
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "Enable IAM User Permissions",
        "Effect": "Allow",
        "Principal": {
          "AWS": "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        },
        "Action": "*",
        "Resource": "*"
      },
      {
        "Sid": "Grant SMS permissions to CloudWatch to publish to an encrypted SNS topic",
        "Effect": "Allow",
        "Principal": {
          "Service": [
            "cloudwatch.amazonaws.com",
            "events.amazonaws.com"
          ]
        },
        "Action": [
          "kms:Decrypt",
          "kms:GenerateDataKey*"
        ],
        "Resource": "*"
      }
    ]
  }
  POLICY
}

resource "aws_kms_alias" "sns_encryption_key_alias" {
  name          = "alias/aws_game_analytics/${local.config.WORKLOAD_NAME}/SnsEncryptionKey"
  target_key_id = aws_kms_key.sns_encryption_key.key_id
}

// Notification topic for alarms
resource "aws_sns_topic" "notifications" {
  name = "${local.config.WORKLOAD_NAME}-Notifications"
  kms_master_key_id = aws_kms_alias.sns_encryption_key_alias.target_key_id
}

// ---- DynamoDB Tables ---- //

// Table organizes and manages different applications
resource "aws_dynamodb_table" "applications_table" {
  name           = "${local.config.WORKLOAD_NAME}-ApplicationsTable-${random_string.stack-random-id-suffix.result}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "application_id"

  attribute {
    name = "application_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    // use default encryption
    enabled = false
  }

  lifecycle {
    prevent_destroy = false
  }
}

// Managed authorizations for applications (Api keys, etc.)
resource "aws_dynamodb_table" "authorizations_table" {
  name           = "${local.config.WORKLOAD_NAME}-AuthorizationsTable-${random_string.stack-random-id-suffix.result}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "api_key_id"
  range_key      = "application_id"

  attribute {
    name = "api_key_id"
    type = "S"
  }

  attribute {
    name = "application_id"
    type = "S"
  }

  attribute {
    name = "api_key_value"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    // use default encryption
    enabled = false
  }

  lifecycle {
    prevent_destroy = false
  }

  global_secondary_index {
    name            = "ApplicationAuthorizations"
    hash_key        = "application_id"
    range_key       = "api_key_id"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ApiKeyValues"
    hash_key        = "api_key_value"
    range_key       = "application_id"
    projection_type = "INCLUDE"
    non_key_attributes = [
      "api_key_id",
      "enabled",
    ]
  }
}

// ---- Kinesis ---- //

// Input stream for applications
resource "aws_kinesis_stream" "game_events_stream" {
  count            = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" || local.config.DATA_STACK == "REDSHIFT" ? 1 : 0
  name             = "${local.config.WORKLOAD_NAME}-GameEventStream-${random_string.stack-random-id-suffix.result}"
  shard_count      = local.config.STREAM_PROVISIONED ? local.config.STREAM_SHARD_COUNT : null
  encryption_type  = "KMS"
  kms_key_id       = "alias/aws/kinesis"

  stream_mode_details {
    stream_mode = local.config.STREAM_PROVISIONED ? "PROVISIONED" : "ON_DEMAND"
  }

  shard_level_metrics = [
    "IncomingBytes",
    "OutgoingBytes",
    "IncomingRecords",
    "OutgoingRecords",
    "ReadProvisionedThroughputExceeded",
    "WriteProvisionedThroughputExceeded",
    "IteratorAgeMilliseconds"
  ]
}

//////////// ---- CONSTRUCT RESOURCES ---- ////////////

// ---- VPC resources (IF REDSHIFT OR REAL TIME in DEV_MODE is enabled) ---- //
module "vpc_construct" {
  source = "./constructs/vpc-construct"
  stack_name                       = local.config.WORKLOAD_NAME
  count = local.config.DATA_STACK == "REDSHIFT" ? 1 : 0
}

// Create flink components
module "flink_construct" {
  count = local.config.REAL_TIME_ANALYTICS ? 1 : 0
  source = "./constructs/flink-construct"

  stack_name                       = local.config.WORKLOAD_NAME
  stream_shard_count               = local.config.STREAM_SHARD_COUNT
  cloudwatch_retention_days        = local.config.CLOUDWATCH_RETENTION_DAYS
  analytics_bucket_arn = aws_s3_bucket.analytics_bucket.arn
  analytics_bucket_name    = aws_s3_bucket.analytics_bucket.id
  game_events_stream_name              = aws_kinesis_stream.game_events_stream[0].name
  game_events_stream_arn           = aws_kinesis_stream.game_events_stream[0].arn
  suffix                           = random_string.stack-random-id-suffix.result
}

// Enable opensearch for real-time dashboards
module "opensearch_construct" {
  count = local.config.REAL_TIME_ANALYTICS ? 1 : 0
  source = "./constructs/opensearch-construct"

  stack_name                       = local.config.WORKLOAD_NAME
  cloudwatch_retention_days        = local.config.CLOUDWATCH_RETENTION_DAYS
  dev_mode                         = local.config.DEV_MODE
  metric_output_stream_arn         = module.flink_construct[0].kinesis_metrics_stream_arn
  metric_output_stream_name        = module.flink_construct[0].kinesis_metrics_stream_name
}

// ---- Redshift ---- //
module "redshift_construct" {
  count = local.config.DATA_STACK == "REDSHIFT" ? 1 : 0
  source = "./constructs/redshift-construct"
  stack_name = local.config.WORKLOAD_NAME
  vpc_id = module.vpc_construct[0].vpc_id
  vpc_subnet = module.vpc_construct[0].vpc_subnet
  vpc_cidr = module.vpc_construct[0].vpc_cidr
  game_events_stream_arn = aws_kinesis_stream.game_events_stream[0].arn
  events_database = local.config.EVENTS_DATABASE
  
}

// ---- Functions ---- //

// Create lambda functions
module "lambda_construct" {
  source = "./constructs/lambda-construct"
  applications_table_name  = aws_dynamodb_table.applications_table.name
  authorizations_table_name = aws_dynamodb_table.authorizations_table.name
  stack_name = local.config.WORKLOAD_NAME
  data_platform_mode = local.config.DATA_STACK
  events_database = local.config.EVENTS_DATABASE
  ingest_mode = local.config.INGEST_MODE
  redshift_namespace_name = local.config.DATA_STACK == "REDSHIFT" ? [module.redshift_construct[0].redshift_namespace_name] : []
  redshift_key_arn =  local.config.DATA_STACK == "REDSHIFT" ? [module.redshift_construct[0].redshift_key_arn] : []
  redshift_workgroup_name =  local.config.DATA_STACK == "REDSHIFT" ? [module.redshift_construct[0].redshift_workgroup_name] : []
  redshift_role_arn =  local.config.DATA_STACK == "REDSHIFT" ? [module.redshift_construct[0].redshift_role_arn] : []
  games_events_stream_name = local.config.DATA_STACK == "REDSHIFT" ? [aws_kinesis_stream.game_events_stream[0].name] : []
  iceberg_enabled = local.config.ENABLE_APACHE_ICEBERG_SUPPORT
}

// Events Processing Function Policy
data "aws_iam_policy_document" "admin_function_policy_document" {
  statement {
    sid    = "DynamoDBAccess"
    effect = "Allow"
    actions = [
                "dynamodb:BatchGetItem",
                "dynamodb:BatchWriteItem",
                "dynamodb:ConditionCheckItem",
                "dynamodb:DeleteItem",
                "dynamodb:DescribeTable",
                "dynamodb:GetItem",
                "dynamodb:GetRecords",
                "dynamodb:GetShardIterator",
                "dynamodb:PutItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:UpdateItem"
    ]
    resources = [
      aws_dynamodb_table.applications_table.arn,
      aws_dynamodb_table.authorizations_table.arn,
      "${aws_dynamodb_table.authorizations_table.arn}/index/*"
    ]
  }
}
resource "aws_iam_role_policy" "admin_function_policy" {
  name   = "${local.config.WORKLOAD_NAME}-events-processing-function-policy"
  role   = module.lambda_construct.admin_function_role_name
  policy = data.aws_iam_policy_document.admin_function_policy_document.json
}

// Events Processing Function Policy
data "aws_iam_policy_document" "events_processing_function_policy_document" {
  statement {
    sid    = "DynamoDBAccess"
    effect = "Allow"
    actions = [
      "dynamodb:BatchGetItem",
      "dynamodb:GetItem",
      "dynamodb:GetRecords",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      aws_dynamodb_table.applications_table.arn,
    ]
  }
}
resource "aws_iam_role_policy" "events_processing_function_policy" {
  name   = "${local.config.WORKLOAD_NAME}-events-processing-function-policy"
  role   = module.lambda_construct.events_processing_function_role_name
  policy = data.aws_iam_policy_document.events_processing_function_policy_document.json
}

// Lambda Authorizer Policy
data "aws_iam_policy_document" "lambda_authorizer_policy_document" {
  statement {
    sid    = "DynamoDBAccess"
    effect = "Allow"
    actions = [
      "dynamodb:BatchGetItem",
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      aws_dynamodb_table.applications_table.arn,
      aws_dynamodb_table.authorizations_table.arn,
      "${aws_dynamodb_table.authorizations_table.arn}/index/*",
    ]
  }
}
resource "aws_iam_role_policy" "lambda_authorizer_policy" {
  name   = "${local.config.WORKLOAD_NAME}-lambda-authorizer-policy"
  role   = module.lambda_construct.lambda_authorizer_role_name
  policy = data.aws_iam_policy_document.lambda_authorizer_policy_document.json
}

// Grant DynamoDB permissions to Lambda functions
resource "aws_dynamodb_table_item" "applications_table_permissions" {
  table_name = aws_dynamodb_table.applications_table.name
  hash_key   = aws_dynamodb_table.applications_table.hash_key

  item = <<ITEM
  {
    "application_id": {"S": "application-id-value"},
    "enabled": {"BOOL": true}
  }
  ITEM

  depends_on = [
    aws_dynamodb_table.applications_table,
    module.lambda_construct.application_admin_service_function,
  ]
}

resource "aws_dynamodb_table_item" "authorizations_table_permissions" {
  table_name = aws_dynamodb_table.authorizations_table.name
  hash_key   = aws_dynamodb_table.authorizations_table.hash_key
  range_key  = aws_dynamodb_table.authorizations_table.range_key

  item = <<ITEM
  {
    "api_key_id": {"S": "api-key-id-value"},
    "application_id": {"S": "application-id-value"},
    "api_key_value": {"S": "api-key-value-value"},
    "enabled": {"BOOL": true}
  }
  ITEM

  depends_on = [
    aws_dynamodb_table.authorizations_table,
    module.lambda_construct.application_admin_service_function,
  ]
}

// Glue datalake and processing jobs
module "data_lake_construct" {
  count = local.config.DATA_STACK == "DATA_LAKE" ? 1 : 0
  source = "./constructs/data-lake-construct"
  stack_name = local.config.WORKLOAD_NAME
  events_database_name = local.config.EVENTS_DATABASE
  raw_events_table_name = local.config.RAW_EVENTS_TABLE
  raw_events_prefix = local.config.RAW_EVENTS_PREFIX
  enable_apache_iceberg_support = local.config.ENABLE_APACHE_ICEBERG_SUPPORT
  notifications_topic_arn = aws_sns_topic.notifications.arn
  analytics_bucket_name    = aws_s3_bucket.analytics_bucket.id
  stack_suffix = random_string.stack-random-id-suffix.result
}

module "data_processing_construct" {
  count = local.config.DATA_STACK == "DATA_LAKE" ? 1 : 0
  source = "./constructs/data-processing-construct"
  stack_name = local.config.WORKLOAD_NAME
  events_database = module.data_lake_construct[0].game_events_database
  raw_events_table_name = local.config.RAW_EVENTS_TABLE
  glue_tmp_prefix = local.config.GLUE_TMP_PREFIX
  processed_events_prefix = local.config.PROCESSED_EVENTS_PREFIX
  notifications_topic_arn = aws_sns_topic.notifications.arn
  analytics_bucket_arn = aws_s3_bucket.analytics_bucket.arn
  analytics_bucket_name    = aws_s3_bucket.analytics_bucket.id
  enable_apache_iceberg_support = local.config.ENABLE_APACHE_ICEBERG_SUPPORT
}

module "athena_construct" {
  count = local.config.DATA_STACK == "DATA_LAKE" ? 1 : 0
  source = "./constructs/samples/athena-construct"
  events_database = module.data_lake_construct[0].game_events_database_name
  game_events_workgroup = module.data_lake_construct[0].athena_workgroup_id
  raw_events_table = local.config.RAW_EVENTS_TABLE
}

// Creates firehose and logs related to ingestion
module "streaming_ingestion_construct" {
  count = local.config.DATA_STACK == "DATA_LAKE" ? 1 : 0
  source = "./constructs/streaming-ingestion-construct"

  game_events_stream_arn = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" ? aws_kinesis_stream.game_events_stream[0].arn : ""
  analytics_bucket_arn = aws_s3_bucket.analytics_bucket.arn
  raw_events_table_name = module.data_lake_construct[0].raw_events_table_name
  game_events_database_name = module.data_lake_construct[0].game_events_database_name
  events_processing_function_arn = module.lambda_construct.events_processing_function_arn
  enable_apache_iceberg_support = local.config.ENABLE_APACHE_ICEBERG_SUPPORT
  s3_backup_mode = local.config.S3_BACKUP_MODE
  raw_events_prefix = local.config.RAW_EVENTS_PREFIX
  cloudwatch_retention_days = local.config.CLOUDWATCH_RETENTION_DAYS
  dev_mode = local.config.DEV_MODE
  ingest_mode = local.config.INGEST_MODE
  stack_name = local.config.WORKLOAD_NAME
}

// ---- API ENDPOINT ---- /
module "games_api_construct" {
  source = "./constructs/api-construct"
  lambda_authorizer_arn = module.lambda_construct.lambda_authorizer_function_arn
  lambda_authorizer_function_name = module.lambda_construct.lambda_authorizer_function_name
  game_events_stream_arn = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" ? aws_kinesis_stream.game_events_stream[0].arn : ""
  game_events_stream_name = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" ? aws_kinesis_stream.game_events_stream[0].name : ""
  game_events_firehose_arn = local.config.INGEST_MODE == "DIRECT_BATCH" ? module.streaming_ingestion_construct[0].game_events_firehose_arn : ""
  game_events_firehose_name = local.config.INGEST_MODE == "DIRECT_BATCH" ? module.streaming_ingestion_construct[0].game_events_firehose_name : ""
  application_admin_service_function_arn = module.lambda_construct.application_admin_service_function_arn
  stack_name = local.config.WORKLOAD_NAME
  api_stage_name = local.config.API_STAGE_NAME
  ingest_mode = local.config.INGEST_MODE
  data_platform_mode = local.config.DATA_STACK
}

// ---- METRICS & ALARMS ---- /
// Register email to topic if email address is provided
resource "aws_sns_topic_subscription" "email_subscription" {
  count = local.config.EMAIL_ADDRESS != "" ? 1 : 0

  topic_arn = aws_sns_topic.notifications.arn
  protocol  = "email"
  endpoint  = local.config.EMAIL_ADDRESS
}

// Create an IAM policy for the SNS topic
data "aws_iam_policy_document" "notifications_topic_policy" {
  statement {
    effect = "Allow"
    actions = ["sns:Publish"]
    principals {
      type = "Service"
      identifiers = ["events.amazonaws.com", "cloudwatch.amazonaws.com"]
    }
    resources = ["*"]
  }
}

resource "aws_sns_topic_policy" "notifications_topic_policy" {
  arn    = aws_sns_topic.notifications.arn
  policy = data.aws_iam_policy_document.notifications_topic_policy.json
}

// Create metrics for solution
module "metrics_construct" {
  source = "./constructs/metrics-construct"

  dynamodb_table_names = [
    aws_dynamodb_table.applications_table.name,
    aws_dynamodb_table.authorizations_table.name,
  ]
  lambda_function_names = [
    module.lambda_construct.events_processing_function_name,
    module.lambda_construct.lambda_authorizer_function_name,
    module.lambda_construct.application_admin_service_function_name,
  ]
  cloudwatch_retention_days           = local.config.CLOUDWATCH_RETENTION_DAYS
  kinesis_stream_name                 = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" ? aws_kinesis_stream.game_events_stream[0].name : ""
  kinesis_metrics_stream_name         = local.config.REAL_TIME_ANALYTICS ? module.flink_construct[0].kinesis_metrics_stream_name : null
  api_gateway_name                    = module.games_api_construct.game_analytics_api_name
  stack_name                          = local.config.WORKLOAD_NAME
  data_platform_mode                  = local.config.DATA_STACK
  firehose_delivery_stream_name       = local.config.DATA_STACK == "DATA_LAKE" ? module.streaming_ingestion_construct[0].game_events_firehose_name : ""
  ingest_mode                         = local.config.INGEST_MODE
  notifications_topic_arn             = aws_sns_topic.notifications.arn
}

module "dashboard_construct" {
  source = "./constructs/dashboard-construct"

  workload_name                       = local.config.WORKLOAD_NAME
  ingest_mode                         = local.config.INGEST_MODE
  game_events_stream_name             = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" || local.config.DATA_STACK == "REDSHIFT" ? aws_kinesis_stream.game_events_stream[0].name : ""
  game_events_firehose_name           = local.config.DATA_STACK == "DATA_LAKE" ? module.streaming_ingestion_construct[0].game_events_firehose_name : ""
  events_processing_function          = module.lambda_construct.events_processing_function_name
  events_processing_function_arn      = module.lambda_construct.events_processing_function_arn
  analytics_processing_function       = local.config.REAL_TIME_ANALYTICS == true ? module.flink_construct[0].kinesis_metrics_stream_name : ""
  api_gateway_name                    = module.games_api_construct.game_analytics_api_name
  api_stage_name                      = module.games_api_construct.game_analytics_api_stage_name
  metrics_stream_name                 = local.config.REAL_TIME_ANALYTICS == true ? module.flink_construct[0].kinesis_metrics_stream_name : ""
  flink_app                           = local.config.REAL_TIME_ANALYTICS == true ? module.flink_construct[0].flink_app_output : ""
  redshift_db_name                    = local.config.EVENTS_DATABASE
  redshift_namespace_db_name          = local.config.DATA_STACK == "REDSHIFT" ? module.redshift_construct[0].redshift_namespace_name : ""
  redshift_workgroup_name             = local.config.DATA_STACK == "REDSHIFT" ? module.redshift_construct[0].redshift_workgroup_name : ""
  data_platform_mode                  = local.config.DATA_STACK
  real_time_analytics                 = local.config.REAL_TIME_ANALYTICS
  collection_id = local.config.REAL_TIME_ANALYTICS == true ? module.opensearch_construct[0].collection_id : ""
  collection_name = local.config.REAL_TIME_ANALYTICS == true ? module.opensearch_construct[0].collection_name : ""
  pipeline_name = local.config.REAL_TIME_ANALYTICS == true ? module.opensearch_construct[0].ingestion_pipeline_name : ""
}

resource "aws_cloudformation_stack" "guidance_deployment_metrics" {
  name          = local.config.WORKLOAD_NAME
  on_failure    = "DO_NOTHING"
  template_body = <<STACK
    {
        "AWSTemplateFormatVersion": "2010-09-09",
        "Description": "Guidance for the Game Analytics Pipeline on AWS (SO0096)",
        "Resources": {
            "EmptyResource": {
                "Type": "AWS::CloudFormation::WaitConditionHandle"
            }
        }
    }
    STACK
}