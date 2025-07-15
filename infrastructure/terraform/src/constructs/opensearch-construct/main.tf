# dead letter queue for ingestion pipeline
resource "aws_s3_bucket" "dead_letter_queue" {
  force_destroy = var.dev_mode ? true : false
}

resource "aws_s3_bucket_versioning" "dead_letter_queue_versioning" {
  bucket = aws_s3_bucket.dead_letter_queue.id

  versioning_configuration {
    status = var.dev_mode ? "Suspended" : "Enabled"
  }
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket_ownership_controls" "dead_letter_queue_ownership" {
  bucket = aws_s3_bucket.dead_letter_queue.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "dead_letter_queue_access_block" {
  bucket = aws_s3_bucket.dead_letter_queue.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dead_letter_queue_encryption" {
  bucket = aws_s3_bucket.dead_letter_queue.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# defines opensearch encryption to be an AWS managed key
resource "aws_opensearchserverless_security_policy" "encryption" {
  name = local.collection_name
  type = "encryption"
  policy = jsonencode({
    Rules = [{
      ResourceType = "collection"
      Resource     = ["collection/${local.collection_name}"]
    }]
    AWSOwnedKey = true
  })
}

# serverless time series cluster
resource "aws_opensearchserverless_collection" "game_analytics_collection" {
  name        = local.collection_name
  description = "Serverless OpenSearch Collection for analyzing real-time timeseries game event data"
  type        = "TIMESERIES"

    depends_on = [
    aws_opensearchserverless_security_policy.encryption
  ]
}

resource "aws_opensearchserverless_security_policy" "network" {
  name = local.collection_name
  type = "network"
  policy = jsonencode([{
    Rules = [{
      Resource     = ["collection/${local.collection_name}"]
      ResourceType = "collection"
    }]
    SourceServices = [
      "application.opensearchservice.amazonaws.com"
    ]
    AllowFromPublic = false
  }])
}

# enable access to collection

# ingestion iam role
resource "aws_iam_role" "ingestion_role" {
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "osis-pipelines.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "ingestion_role_policy" {
  name   = "pipeline_access_permissions"
  role   = aws_iam_role.ingestion_role.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
        {
          Sid    = "allowReadFromStream"
          Effect = "Allow"
          Action = [
            "kinesis:DescribeStream",
            "kinesis:DescribeStreamSummary",
            "kinesis:GetRecords",
            "kinesis:GetShardIterator",
            "kinesis:ListShards",
            "kinesis:ListStreams",
            "kinesis:ListStreamConsumers",
            "kinesis:RegisterStreamConsumer"
          ]
          Resource = [var.metric_output_stream_arn]
        },
        {
          Sid    = "allowAPIs"
          Effect = "Allow"
          Action = [
            "aoss:APIAccessAll",
            "aoss:BatchGetCollection"
          ]
          Resource = [aws_opensearchserverless_collection.game_analytics_collection.arn]
        },
        {
          Sid    = "allowSecurityPolicy"
          Effect = "Allow"
          Action = [
            "aoss:CreateSecurityPolicy",
            "aoss:UpdateSecurityPolicy",
            "aoss:GetSecurityPolicy"
          ]
          Resource = ["*"]
          Condition = {
            StringLike = {
              "aoss:collection" = [aws_opensearchserverless_collection.game_analytics_collection.name]
            }
            StringEquals = {
              "aws:ResourceAccount" = [data.aws_caller_identity.current.account_id]
            }
          }
        },
        {
          Sid    = "s3Access"
          Effect = "Allow"
          Action = ["s3:PutObject"]
          Resource = ["${aws_s3_bucket.dead_letter_queue.arn}/*"]
        }
    ]
  })
}

resource "aws_cloudwatch_log_group" "ingestion" {
  name              = "/aws/vendedlogs/OpenSearchIngestion/${local.pipeline_name}/audit-logs"
  retention_in_days = var.cloudwatch_retention_days

  # If you want to match the CDK's RemovalPolicy.DESTROY behavior
  skip_destroy = false
}


resource "aws_osis_pipeline" "ingestion" {
  pipeline_name = local.pipeline_name
  min_units = 2
  max_units = 4
  
  pipeline_configuration_body = templatefile("${path.root}/../../../business-logic/opensearch-ingestion/ingestion-definition.yml", {
    pipeline_name       = local.pipeline_name
    stream_name         = var.metric_output_stream_name
    host_name           = aws_opensearchserverless_collection.game_analytics_collection.collection_endpoint
    network_policy_name = aws_opensearchserverless_collection.game_analytics_collection.name
    role                = aws_iam_role.ingestion_role.arn
    dlq_bucket_name     = aws_s3_bucket.dead_letter_queue.id
    region              = data.aws_region.current.region
  })

  log_publishing_options {
    is_logging_enabled         = true
    cloudwatch_log_destination {
      log_group = aws_cloudwatch_log_group.ingestion.name
    }
  }
}

resource "aws_opensearchserverless_access_policy" "metric_collection_access_policy" {
  name = aws_opensearchserverless_collection.game_analytics_collection.name
  type = "data"
  
  policy = jsonencode([
    {
      Rules = [
        {
          Resource     = ["collection/${local.collection_name}"]
          Permission  = [
            "aoss:CreateCollectionItems",
            "aoss:DeleteCollectionItems",
            "aoss:UpdateCollectionItems",
            "aoss:DescribeCollectionItems"
          ]
          ResourceType = "collection"
        },
        {
          Resource     = ["index/${local.collection_name}/*"]
          Permission  = [
            "aoss:CreateIndex",
            "aoss:DeleteIndex",
            "aoss:UpdateIndex",
            "aoss:DescribeIndex",
            "aoss:ReadDocument",
            "aoss:WriteDocument"
          ]
          ResourceType = "index"
        }
      ]
      Principal    = [aws_iam_role.opensearch_admin.arn]
      Description = "Allow access by Opensearch Admin"
    },
    {
      Rules = [
        {
          Resource     = ["collection/${local.collection_name}"]
          Permission  = [
            "aoss:UpdateCollectionItems",
            "aoss:DescribeCollectionItems"
          ]
          ResourceType = "collection"
        },
        {
          Resource     = ["index/${local.collection_name}/*"]
          Permission  = [
            "aoss:CreateIndex",
            "aoss:UpdateIndex",
            "aoss:DescribeIndex",
            "aoss:ReadDocument",
            "aoss:WriteDocument"
          ]
          ResourceType = "index"
        }
      ]
      Principal    = [aws_iam_role.ingestion_role.arn]
      Description = "Pipeline-Data-Policy"
    }
  ])
}

// opensearch admin

resource "aws_iam_role" "opensearch_admin" {
  name = "${var.stack_name}-OpenSearchAdmin"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
      }
    }]
  })
}

resource "aws_iam_role_policy" "opensearch_admin_policy" {
  name   = "opensearch_admin_policy"
  role   = aws_iam_role.opensearch_admin.name
  policy = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect = "Allow"
        Action = [
          "es:GetApplication",
          "es:ListApplications",
          "es:UpdateApplication",
          "es:AddTags",
          "es:ListTags",
          "es:RemoveTags",
          "aoss:APIAccessAll",
          "es:ESHttp*",
          "opensearch:StartDirectQuery",
          "opensearch:GetDirectQuery",
          "opensearch:CancelDirectQuery",
          "opensearch:GetDirectQueryResult",
          "opensearch:ApplicationAccessAll",
          "aoss:BatchGetCollection",
          "aoss:ListCollections",
          "aoss:DashboardsAccessAll",
          "es:DescribeDomain",
          "es:DescribeDomains",
          "es:ListDomainNames",
          "es:GetDirectQueryDataSource",
          "es:ListDirectQueryDataSources"
        ]
        Resource = ["*"]
      }]
  })
}

// ui application


resource "awscc_opensearchservice_application" "dashboard" {
  name = aws_opensearchserverless_collection.game_analytics_collection.name

  app_configs = [{
    key   = "opensearchDashboards.dashboardAdmin.users"
    value = "*"
  }]

  data_sources = [{
    data_source_arn         = aws_opensearchserverless_collection.game_analytics_collection.arn
    data_source_description = "Game Analytics Pipeline Metric Collection"
  }]
}
