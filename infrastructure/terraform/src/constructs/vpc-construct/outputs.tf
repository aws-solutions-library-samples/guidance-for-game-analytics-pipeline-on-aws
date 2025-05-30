output "vpc_id" {
  value = aws_vpc.infra_vpc.id
}

output "vpc_subnets" {
  value = data.aws_subnets.infra_vpc_subnets
}

output "vpc_cidr" {
  value = aws_vpc.infra_vpc.cidr_block
}