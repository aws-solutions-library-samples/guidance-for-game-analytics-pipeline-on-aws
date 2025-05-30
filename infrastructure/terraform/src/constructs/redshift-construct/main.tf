resource "aws_kms_key" "redshift_kms_key" {
  description             = "KMS Key for encrypting SNS"
  enable_key_rotation     = true
  deletion_window_in_days = 7
}

resource "aws_security_group" "redshift_security_group" {
  name        = "${var.stack_name}-RedshiftSecurityGroup"
  description = "Allow inbound from the VPC"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "redshift_security_group_ingress_rule" {
  security_group_id = aws_security_group.redshift_security_group.id
  cidr_ipv4         = var.vpc_cidr
  from_port         = 5439
  ip_protocol       = "tcp"
  to_port           = 5439
}

resource "aws_iam_role" "redshift_role" {
  name = "${var.stack_name}-RedshiftRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = [
            "redshift.amazonaws.com",
            "redshift-serverless.amazonaws.com"
            ]
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "redshift_role_managed_policy" {
  role   = aws_iam_role.redshift_role.id
  policy_arn = "arn:aws:iam::aws:policy/AmazonRedshiftFullAccess"
}

resource "aws_iam_role_policy" "redshift_role_kinesis_policy" {
  role = aws_iam_role.redshift_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "kinesis:DescribeStreamSummary",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:ListShards",
          "kinesis:DescribeStream"
        ]
        Effect = "Allow"
        Resource = [var.game_events_stream_arn]
      },
      {
        Action = [
          "kinesis:ListStreams"
        ]
        Effect = "Allow"
        Resource = "*"
      }
    ]
  })
}

resource "awscc_redshiftserverless_namespace" "redshift_namespace" {
  namespace_name      = "${lower(var.stack_name)}-workspace"
  admin_password_secret_kms_key_id = aws_kms_key.redshift_kms_key
  db_name             = var.events_database
  default_iam_role_arn = aws_iam_role.redshift_role.arn
  iam_roles            = [aws_iam_role.redshift_role.arn]
  kms_key_id = aws_kms_key.redshift_kms_key
  manage_admin_password = true
}

resource "aws_redshiftserverless_workgroup" "redshift_workgroup" {
  workgroup_name = "${lower(var.stack_name)}-workgroup"
  base_capacity = 16
  namespace_name = awscc_redshiftserverless_namespace.redshift_namespace.namespace_name
  port = 5439
  publicly_accessible = false
  security_group_ids = [aws_security_group.redshift_security_group]
  subnet_ids = var.vpc_subnets
  config_parameter {
    parameter_key = "enable_case_sensitive_identifier"
    parameter_value = "true"
  }
}