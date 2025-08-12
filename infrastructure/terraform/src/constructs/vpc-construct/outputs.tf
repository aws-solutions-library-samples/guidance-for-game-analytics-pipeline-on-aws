output "vpc_id" {
  value = aws_vpc.infra_vpc.id
}

output "vpc_subnet" {
  value = aws_subnet.subnets[*].id
}

output "vpc_cidr" {
  value = aws_vpc.infra_vpc.cidr_block
}