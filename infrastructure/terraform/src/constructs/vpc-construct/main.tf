data "aws_availability_zones" "available" {}

resource "aws_vpc" "infra_vpc" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "subnets" {
  count             = 3
  vpc_id            = aws_vpc.infra_vpc.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone  = data.aws_availability_zones.available.names[count.index]
}

resource "aws_flow_log" "infra_vpc_flowlog" {
  iam_role_arn    = aws_iam_role.infra_vpc_flowlog_role.arn
  log_destination = aws_cloudwatch_log_group.infra_vpc_flowlog_log_group.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.infra_vpc.id
}

resource "aws_cloudwatch_log_group" "infra_vpc_flowlog_log_group" {
  name = "/aws/vpc/${aws_vpc.infra_vpc.id}"
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "infra_vpc_flowlog_role" {
  name               = "${var.stack_name}-infra-vpc-flowlog-role"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

data "aws_iam_policy_document" "infra_vpc_flowlog_policy_document" {
  statement {
    effect = "Allow"

    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ]

    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "infra_vpc_role_policy" {
  name   = "${var.stack_name}-infra-vpc-flowlog-role-policy"
  role   = aws_iam_role.infra_vpc_flowlog_role.id
  policy = data.aws_iam_policy_document.infra_vpc_flowlog_policy_document.json
}