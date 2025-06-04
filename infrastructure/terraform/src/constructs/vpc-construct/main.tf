resource "aws_vpc" "infra_vpc" {
  cidr_block = "10.0.0.0/16"
}

data "aws_subnets" "infra_vpc_subnets" {
  filter {
    name   = "vpc-id"
    values = [aws_vpc.infra_vpc.id]
  }
}