data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# Glue Database
resource "aws_glue_catalog_database" "game_events_database" {
  name        = "${var.events_database_name}"
  description = "Database for game analytics events for stack: ${var.stack_name}"
  location_uri = "s3://${var.analytics_bucket_name}"
}

// ---- Athena ---- //
// Define the resources for the `GameAnalyticsWorkgroup` Athena workgroup
resource "aws_athena_workgroup" "game_analytics_workgroup" {
  name        = "${var.stack_name}-GameAnalyticsWorkgroup-${var.stack_suffix}"
  description = "Default workgroup for the solution workload"
  force_destroy = true

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${var.analytics_bucket_name}/athena_query_results/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }
}

/*
// Enables the recommended encryption settings for the account Glue Data Catalog
// Applies to all databases and tables in the account; uncomment to apply
// Do not apply this setting if the account already has data encryption enabled to avoid conflicts
resource "aws_glue_data_catalog_encryption_settings" "data_catalog_encryption_settings" {
  data_catalog_encryption_settings {
    connection_password_encryption {
      return_connection_password_encrypted = true
    }

    encryption_at_rest {
      catalog_encryption_mode         = "SSE-KMS"
    }
  }
}
*/

# Glue Table for raw events
resource "aws_glue_catalog_table" "raw_events_table" {
  name          = var.raw_events_table_name
  database_name = aws_glue_catalog_database.game_events_database.name
  description = "Stores raw event data from the game analytics pipeline for stack ${var.stack_name}"
  table_type = "EXTERNAL_TABLE"
  
  parameters = {
    classification   = "parquet"
    compressionType  = "none"
    typeOfData       = "file"
  }
  
  dynamic open_table_format_input {
    for_each = var.enable_apache_iceberg_support ? [1] : []
    content {
      iceberg_input {
        metadata_operation = "CREATE"
        version = "2"
      }
    }
  }

  storage_descriptor {
    location      = "s3://${var.analytics_bucket_name}/${var.raw_events_prefix}"
    input_format  = var.enable_apache_iceberg_support ? null : "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = var.enable_apache_iceberg_support ? null : "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"
    compressed = var.enable_apache_iceberg_support ? null : false
    number_of_buckets = var.enable_apache_iceberg_support ? null : -1
    
    dynamic ser_de_info {
      for_each = var.enable_apache_iceberg_support ? [] : [1]
      content {
        name                  = "ParquetHiveSerDe"
        serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
        
        parameters = {
          "serialization.format" = 1
        }
      }
    }

    bucket_columns = var.enable_apache_iceberg_support ? null : []
    stored_as_sub_directories = false
    columns {
      name = "event_id"
      type = "string"
    }
    columns {
      name = "event_type"
      type = "string"
    }
    columns {
      name = "event_name"
      type = "string"
    }
    columns {
      name = "event_version"
      type = "string"
    }
    columns {
      name = "event_timestamp"
      type = "timestamp"
    }
    columns {
      name = "app_version"
      type = "string"
    }
    columns {
      name = "application_id"
      type = "string"
    }
    columns {
      name = "application_name"
      type = "string"
    }
    columns {
      name = "event_data"
      type = "string"
    }
    columns {
      name = "metadata"
      type = "string"
    }
  }
}

/* The following sets up automatic Glue table optimization for Apache Iceberg */
resource "aws_iam_role" "glue_optimization_service_role" {
  count = var.enable_apache_iceberg_support ? 1 : 0
  name = "${var.stack_name}-glue-optimization-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "glue.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "glue_optimization_service_role_policy" {
  count = var.enable_apache_iceberg_support ? 1 : 0
  name = "${var.stack_name}-glue-iceberg-table-optimization"
  role = aws_iam_role.glue_optimization_service_role.name

  policy = jsonencode({
    Version: "2012-10-17",
    Statement = [
            {
                "Effect": "Allow",
                "Action": [
                    "s3:PutObject",
                    "s3:GetObject",
                    "s3:DeleteObject"
                ],
                "Resource": [
                    "arn:aws:s3:::${var.analytics_bucket_name}/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "s3:ListBucket"
                ],
                "Resource": [
                    "arn:aws:s3:::${var.analytics_bucket_name}"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "glue:UpdateTable",
                    "glue:GetTable"
                ],
                "Resource": [
                    aws_glue_catalog_table.raw_events_table.arn,
                    aws_glue_catalog_database.game_events_database.arn,
                    "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:catalog"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": [
                    "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws-glue/iceberg-compaction/logs:*",
                    "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws-glue/iceberg-retention/logs:*",
                    "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws-glue/iceberg-orphan-file-deletion/logs:*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                  "s3:ListAllMyBuckets",
                  "s3:GetBucketAcl",
                  "ec2:DescribeVpcEndpoints",
                  "ec2:DescribeRouteTables",
                  "ec2:CreateNetworkInterface",
                  "ec2:DeleteNetworkInterface",
                  "ec2:DescribeNetworkInterfaces",
                  "ec2:DescribeSecurityGroups",
                  "ec2:DescribeSubnets",
                  "ec2:DescribeVpcAttribute",
                  "iam:ListRolePolicies",
                  "iam:GetRole",
                  "iam:GetRolePolicy",
                  "cloudwatch:PutMetricData"
                ],
                "Resource": ["*"]
            },
            {
                "Effect": "Allow",
                "Action": [
                  "s3:CreateBucket"
                ],
                "Resource": ["arn:aws:s3:::aws-glue-*"]
            },
            {
                "Effect": "Allow",
                "Action": [
                  "s3:GetObject",
                  "s3:PutObject",
                  "s3:DeleteObject"
                ],
                "Resource": [
                  "arn:aws:s3:::aws-glue-*/*",
                  "arn:aws:s3:::*/*aws-glue-*/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                  "s3:GetObject"
                ],
                "Resource": [
                  "arn:aws:s3:::crawler-public*",
                  "arn:aws:s3:::aws-glue-*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents"
                ],
                "Resource": [
                  "arn:aws:logs:*:*:*:/aws-glue/*"
                ]
            },
            {
                "Effect": "Allow",
                "Action": [
                  "ec2:CreateTags",
                  "ec2:DeleteTags"
                ],
                "Condition": {
                  "ForAllValues:StringEquals" : {
                    "aws:TagKeys" : [
                      "aws-glue-service-resource"
                    ]
                  }
                },
                "Resource": [
                  "arn:aws:ec2:*:*:network-interface/*",
                  "arn:aws:ec2:*:*:security-group/*",
                  "arn:aws:ec2:*:*:instance/*"
                ]
            }
        ]
  })
}

resource "aws_glue_catalog_table_optimizer" "raw_events_compaction_optimizer" {
  count = var.enable_apache_iceberg_support ? 1 : 0
  catalog_id = data.aws_caller_identity.current.account_id
  database_name = aws_glue_catalog_database.game_events_database.name
  table_name = aws_glue_catalog_table.raw_events_table.name
  configuration {
    role_arn = aws_iam_role.glue_optimization_service_role[0].arn
    enabled  = true
  }
  type = "compaction"
}

resource "aws_glue_catalog_table_optimizer" "raw_events_retention_optimizer" {
  count = var.enable_apache_iceberg_support ? 1 : 0
  catalog_id = data.aws_caller_identity.current.account_id
  database_name = aws_glue_catalog_database.game_events_database.name
  table_name = aws_glue_catalog_table.raw_events_table.name
  configuration {
    role_arn = aws_iam_role.glue_optimization_service_role[0].arn
    enabled  = true
  }
  type = "retention"
}

resource "aws_glue_catalog_table_optimizer" "raw_events_orphan_file_deletion_optimizer" {
  count = var.enable_apache_iceberg_support ? 1 : 0
  catalog_id = data.aws_caller_identity.current.account_id
  database_name = aws_glue_catalog_database.game_events_database.name
  table_name = aws_glue_catalog_table.raw_events_table.name
  configuration {
    role_arn = aws_iam_role.glue_optimization_service_role[0].arn
    enabled  = true
  }
  type = "orphan_file_deletion"
}