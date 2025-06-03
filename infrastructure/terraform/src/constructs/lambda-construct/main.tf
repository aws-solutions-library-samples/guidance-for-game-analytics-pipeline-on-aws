# Lambda function: EventsProcessingFunction
/* The following variables define the necessary resources for the `EventsProcessingFunction` serverless
function. This function to process and transform raw events before they get written to S3. */
module "events_processing_function" {
  source = "terraform-aws-modules/lambda/aws"

  function_name = "${var.stack_name}-EventsProcessingFunction"
  description   = "Function to process and transform raw events before they get written to S3"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  source_path   = "${path.root}/../../../business-logic/events-processing"
  timeout       = 300
  memory_size   = 256

  create_role = false
  lambda_role = aws_iam_role.events_processing_function_role.arn

  environment_variables = {
      APPLICATIONS_TABLE    = var.applications_table_name
      CACHE_TIMEOUT_SECONDS = "60"
  }
}

# Lambda function: LambdaAuthorizer
module "lambda_authorizer" {
  source = "terraform-aws-modules/lambda/aws"

  function_name = "${var.stack_name}-LambdaAuthorizer"
  description   = "API Gateway Lambda Authorizer used to validate requests to solution /events API endpoint."
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  source_path   = "${path.root}/../../../business-logic/api/lambda-authorizer"
  timeout       = 60
  memory_size   = 128

  create_role = false
  lambda_role = aws_iam_role.lambda_authorizer_role.arn

  environment_variables = {
      AUTHORIZATIONS_TABLE             = var.authorizations_table_name
      APPLICATION_AUTHORIZATIONS_INDEX = "ApplicationAuthorizations"
      APPLICATIONS_TABLE               = var.applications_table_name
  }
}


# Lambda function: ApplicationAdminServiceFunction
/* The following variables define the necessary resources for the `ApplicationAdminServiceFunction`.
This function provides the application admin microservice. */
module "application_admin_service_function" {
  source = "terraform-aws-modules/lambda/aws"

  function_name = "${var.stack_name}-ApplicationAdminServiceFunction"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  source_path   = "${path.root}/../../../business-logic/api/admin"
  timeout       = 60
  memory_size   = 128

  create_role = false
  lambda_role = aws_iam_role.application_admin_service_function_role.arn

  environment_variables = {
      AUTHORIZATIONS_TABLE             = var.authorizations_table_name
      APPLICATION_AUTHORIZATIONS_INDEX = "ApplicationAuthorizations"
      APPLICATIONS_TABLE               = var.applications_table_name
      INGEST_MODE                      = var.ingest_mode
      DATA_PLATFORM_MODE               = var.data_platform_mode
      SECRET_ARN                       = "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:redshift!${aws_secretsmanager_secret.redshift_admin_secret.name}-*"
      WORKGROUP_NAME                   = aws_redshift_workgroup.redshift_workgroup.name
      DATABASE_NAME                    = var.events_database
      REDSHIFT_ROLE_ARN                = aws_iam_role.redshift_role.arn
      STREAM_NAME                      = aws_kinesis_stream.games_events_stream.name
  }
}

# IAM roles for Lambda functions
resource "aws_iam_role" "events_processing_function_role" {
  name = "${var.stack_name}-events-processing-function-role"

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

resource "aws_iam_role" "lambda_authorizer_role" {
  name = "${var.stack_name}-lambda-authorizer-role"

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

resource "aws_iam_role" "application_admin_service_function_role" {
  name = "${var.stack_name}-application-admin-service-function-role"

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

resource "aws_iam_role_policy" "application_admin_service_function_policy" {
  name = "${var.stack_name}-application-admin-service-function-policy"
  role = "application_admin_service_function_role"

  policy = jsonencode({
    Version: "2012-10-17",
    Statement = [
      {
        Effect: "Allow",
        Action: [
          "redshift-data:GetStatementResult",
          "redshift-data:ListStatements",
          "redshift-data:ExecuteStatement",
          "redshift-data:BatchExecuteStatement"
        ],
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: [
          "redshift-data:CancelStatement",
          "redshift-data:DescribeStatement"
        ],
        Resource: "*"
      },
      {
        Effect: "Allow",
        Action: [
          "secretsmanager:GetSecretValue"
        ],
        Resource: "${aws_secretsmanager_secret.redshift_admin_secret.arn}"
      },
      {
        Effect: "Allow",
        Action: [
          "kms:Decrypt*"
        ],
        Resource: "${aws_kms_key.redshift_key.arn}"
      }
    ]
  })
}