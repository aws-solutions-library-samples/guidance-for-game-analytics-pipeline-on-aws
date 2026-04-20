locals {
  game_analytics_open_api_spec = templatefile("${path.root}/../../../business-logic/api/api-definitions/game-analytics-api-tf.yaml", {
    api_gateway_role = aws_iam_role.api_gateway_role.arn,
    application_admin_service_function = "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.region}:lambda:path/2015-03-31/functions/${var.application_admin_service_function_arn}/invocations",
    kinesis_putrecords_url = var.ingest_mode == "KINESIS_DATA_STREAMS" ? "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.region}:kinesis:action/PutRecords" :"arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.region}:firehose:action/PutRecordBatch",
    lambda_authorizer = "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.region}:lambda:path/2015-03-31/functions/${var.lambda_authorizer_arn}/invocations",
    ingest_application_json = local.api_gateway_body[var.ingest_mode].value,
    ingest_response_200 = local.api_gateway_body[var.ingest_mode].response_200,
    ingest_response_400 = local.api_gateway_body[var.ingest_mode].response_400,
    ingest_response_500 = local.api_gateway_body[var.ingest_mode].response_500,
    authorizer_credentials = aws_iam_role.api_gateway_role.arn
  })
}