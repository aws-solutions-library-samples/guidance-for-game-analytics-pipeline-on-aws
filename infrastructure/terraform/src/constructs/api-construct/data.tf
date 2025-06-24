locals {
  game_analytics_open_api_spec = templatefile("${path.root}/../../../business-logic/api/api-definitions/game-analytics-api-tf.yaml", {
    api_gateway_role = aws_iam_role.api_gateway_role.arn,
    application_admin_service_function = "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.application_admin_service_function_arn}/invocations",
    kinesis_putrecords_url = var.ingest_mode == "KINESIS_DATA_STREAMS" ? "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}:kinesis:action/PutRecords" :"arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}:firehose:action/PutRecordBatch",
    lambda_authorizer = "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}:lambda:path/2015-03-31/functions/${var.lambda_authorizer_arn}/invocations",
    ingest_application_json = local.api_gateway_body[var.ingest_mode].value,
    authorizer_credentials = aws_iam_role.api_gateway_role.arn
  })
}