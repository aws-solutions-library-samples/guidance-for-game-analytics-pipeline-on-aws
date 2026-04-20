data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

resource "aws_security_group" "msk_security_group" {
  name        = "MskSecurityGroup"
  description = "Allow inbound from the VPC"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "msk_security_group" {
  security_group_id = aws_security_group.msk_security_group.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "msk_security_group" {
  security_group_id = aws_security_group.msk_security_group.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_cloudwatch_log_group" "game_analytics_cluster_logs" {
  name = replace("${var.stack_name}-cluster-logs", "_", "-")
}

// https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-express.html
locals {
  cluster_name = var.cluster_name != null ? var.cluster_name : replace("${var.stack_name}-cluster", "_", "-")
}

resource "aws_msk_cluster" "game_analytics_cluster" {
  cluster_name           = local.cluster_name
  kafka_version          = "3.8.x"
  number_of_broker_nodes = 3
  enhanced_monitoring    = "PER_TOPIC_PER_PARTITION"

  broker_node_group_info {
    instance_type  = var.cluster_instance_type
    client_subnets = var.vpc_subnet

    connectivity_info {
      vpc_connectivity {
        client_authentication {
          sasl {
            iam = true
          }
        }
      }
    }
    security_groups = [aws_security_group.msk_security_group.id]
  }

  client_authentication {
    sasl {
      iam = true
    }
  }
  # MSK cluster can take 2+ hours to deploy
  timeouts {
    create = "180m"
  }
}


resource "aws_msk_cluster_policy" "enable_firehose" {
  cluster_arn = aws_msk_cluster.game_analytics_cluster.arn

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow"
      Principal = {
        "Service" : "firehose.amazonaws.com"
      }
      Action = [
        "kafka:CreateVpcConnection",
        "kafka:GetBootstrapBrokers",
        "kafka:DescribeCluster",
        "kafka:DescribeClusterV2"
      ]
      Resource = aws_msk_cluster.game_analytics_cluster.arn
      },
      {
        Effect = "Allow"
        Principal = {
          "AWS" : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = [
          "kafka:CreateVpcConnection",
          "kafka:GetBootstrapBrokers",
          "kafka:DescribeCluster",
          "kafka:DescribeClusterV2"
        ]
        Resource = aws_msk_cluster.game_analytics_cluster.arn
    }]
  })
}

resource "aws_msk_topic" "game_event_topic" {
  name        = var.topic_name
  cluster_arn = aws_msk_cluster.game_analytics_cluster.arn

  partition_count    = var.partition_count
  replication_factor = 3
}

### VPC-Attached Event Ingestion Lambda

module "event_ingestion_function" {
  source = "terraform-aws-modules/lambda/aws"

  function_name = "${var.stack_name}-KafkaEventIngestionFunction"
  description   = "Kafka producer used to send events into a deployed game analytics pipeline MSK topic"
  handler       = "index.handler"
  runtime       = "nodejs24.x"
  source_path   = "${path.root}/../../../business-logic/kafka-event-ingestion-lambda"
  timeout       = 300
  memory_size   = 256
  architectures = ["arm64"]
  
  vpc_subnet_ids         = var.vpc_subnet
  vpc_security_group_ids = [aws_security_group.msk_security_group.id] // TODO: Replace with custom lambda security group
  attach_network_policy  = true

  create_role = false
  lambda_role = aws_iam_role.event_ingestion_function_role.arn

  tracing_mode = "PassThrough"

  environment_variables = {
    BROKERS    = aws_msk_cluster.game_analytics_cluster.bootstrap_brokers_sasl_iam
    TOPIC      = aws_msk_topic.game_event_topic.name
  }
}


# IAM roles for Lambda functions
resource "aws_iam_role" "event_ingestion_function_role" {
  name = "${var.stack_name}-kafka-event-ingestion-function-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# managed policies for events processin function
resource "aws_iam_role_policy_attachment" "event_ingestion_function_role_basic_execution_attachment" {
  role       = aws_iam_role.event_ingestion_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "event_ingestion_function_role_xray_attachment" {
  role       = aws_iam_role.event_ingestion_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess"
}

resource "aws_iam_role_policy_attachment" "event_ingestion_function_role_vpc_attachment" {
  role       = aws_iam_role.event_ingestion_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}


resource "aws_iam_role_policy" "event_ingestion_function_policy" {
  name = "${var.stack_name}-event-ingestion-kafka-policy"
  role = aws_iam_role.event_ingestion_function_role.name

  policy = jsonencode({
    Version : "2012-10-17",
    Statement = [
      {
        Effect : "Allow",
        Action : [
          "kafka-cluster:Connect",
          "kafka-cluster:DescribeCluster",
        ],
        Resource : aws_msk_cluster.game_analytics_cluster.arn
      },
      {
        Effect : "Allow",
        Action : [
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:WriteData",
        ],
        Resource : aws_msk_topic.game_event_topic.arn
      }
    ]
  })
}
