# Lambda function: EventsProcessingFunction
/* The following variables define the necessary resources for the `EventsProcessingFunction` serverless
function. This function to process and transform raw events before they get written to S3. */
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

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

  environment_variables = merge({
      AUTHORIZATIONS_TABLE             = var.authorizations_table_name
      APPLICATION_AUTHORIZATIONS_INDEX = "ApplicationAuthorizations"
      APPLICATIONS_TABLE               = var.applications_table_name
      INGEST_MODE                      = var.ingest_mode
      DATA_PLATFORM_MODE               = var.data_platform_mode
      DATABASE_NAME                    = var.events_database
      STREAM_NAME                      = length(var.games_events_stream_name) == 1 ? var.games_events_stream_name[0] : ""
  }, var.data_platform_mode == "REDSHIFT" ? {
      SECRET_ARN                       = "redshift!${var.redshift_namespace_name[0]}-admin"
      WORKGROUP_NAME                   = var.redshift_workgroup_name[0]
      REDSHIFT_ROLE_ARN                = var.redshift_role_arn[0]
  } : {})
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

# managed policies for events processin function
resource "aws_iam_role_policy_attachment" "events_processing_function_role_basic_execution_attachment" {
  role       = aws_iam_role.events_processing_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "events_processing_function_role_xray_attachment" {
  role       = aws_iam_role.events_processing_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess"
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
resource "aws_iam_role_policy_attachment" "lambda_authorizer_role_basic_execution_attachment" {
  role       = aws_iam_role.lambda_authorizer_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
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
resource "aws_iam_role_policy_attachment" "application_admin_role_basic_execution_attachment" {
  role       = aws_iam_role.application_admin_service_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "application_admin_service_function_policy" {
  count = var.data_platform_mode == "REDSHIFT" ? 1 : 0
  name = "${var.stack_name}-application-admin-service-function-policy"
  role = aws_iam_role.application_admin_service_function_role.name

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
        Resource: "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:redshift!${var.redshift_namespace_name[0]}-admin*"
      },
      {
        Effect: "Allow",
        Action: [
          "kms:Decrypt*"
        ],
        Resource: "${var.redshift_key_arn[0]}"
      }
    ]
  })
}