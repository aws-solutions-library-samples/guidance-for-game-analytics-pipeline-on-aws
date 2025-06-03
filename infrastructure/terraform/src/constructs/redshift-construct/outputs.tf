output "redshift_role_arn" {
  value = aws_iam_role.redshift_role.arn
}

output "redshift_namespace_name" {
  value = awscc_redshiftserverless_namespace.redshift_namespace.namespace_name
}

output "redshift_workgroup_name" {
  value = aws_redshiftserverless_workgroup.redshift_workgroup.workgroup_name
}