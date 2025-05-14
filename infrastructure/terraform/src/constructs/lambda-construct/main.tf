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
