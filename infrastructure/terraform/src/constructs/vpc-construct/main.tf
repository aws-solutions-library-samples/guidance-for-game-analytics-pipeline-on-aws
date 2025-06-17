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