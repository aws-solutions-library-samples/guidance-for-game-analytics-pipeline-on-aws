/**
 * Copyright 2023 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface ApiConstructProps extends cdk.StackProps {
  gameEventsStream: cdk.aws_kinesis.Stream;
  applicationAdminServiceFunction: cdk.aws_lambda.Function;
  lambdaAuthorizer: cdk.aws_lambda.Function;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<ApiConstructProps> = {};

/**
 * Deploys the Api construct
 *
 * This construct uses an openAPI spec, it should be moved to an L2 construct.
 * API is used to create and manage applications for the pipeline
 */
export class ApiConstruct extends Construct {
  public readonly gameAnalyticsApi: apigateway.IRestApi;

  constructor(parent: Construct, name: string, props: ApiConstructProps) {
    super(parent, name);

    const apiGatewayRole = new iam.Role(this, "ApiGatewayRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });
    apiGatewayRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["kinesis:PutRecord", "kinesis:PutRecords"],
        resources: [props.gameEventsStream.streamArn],
        effect: iam.Effect.ALLOW,
        sid: "ApigatewayPutKinesis",
      })
    );
    apiGatewayRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:InvokeFunction"],
        resources: [
          props.applicationAdminServiceFunction.functionArn,
          props.lambdaAuthorizer.functionArn,
        ],
        effect: iam.Effect.ALLOW,
        sid: "ApigatewayInvokeLambda",
      })
    );

    // Core API, used to manage applications externally
    const gameAnalyticsApi = new apigateway.SpecRestApi(
      this,
      "GameAnalyticsApi",
      {
        restApiName: `GameAnalyticsApi-${cdk.Aws.STACK_NAME}`,
        // defaultCorsPreflightOptions: {
        //     allowHeaders: ["authorization", "content-type"],
        //     allowMethods: apigateway.Cors.ALL_METHODS,
        //     allowOrigins: ["*"],
        // },
        deployOptions: {
          stageName: props.config.API_STAGE_NAME,
          tracingEnabled: true,
          methodOptions: {
            "/*/*": {
              dataTraceEnabled: true,
              loggingLevel: apigateway.MethodLoggingLevel.ERROR,
              metricsEnabled: true,
            },
          },
        },
        description: "API Gateway for Game Analytics",
        disableExecuteApiEndpoint: false,
        apiDefinition: apigateway.ApiDefinition.fromInline({
          openapi: "3.0.0",
          info: {
            title: "Game Analytics Pipeline API",
          },
          schemes: ["https"],
          "x-amazon-apigateway-api-key-source": "AUTHORIZER",
          "x-amazon-apigateway-request-validators": {
            all: {
              validateRequestBody: true,
              validateRequestParameters: true,
            },
          },
          "x-amazon-apigateway-gateway-responses": {
            BAD_REQUEST_BODY: {
              responseTemplates: {
                "application/json":
                  '{ "error": "BadRequest", "error_detail": "$context.error.validationErrorString" }\n',
              },
              responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
              },
            },
            DEFAULT_4XX: {
              statusCode: 400,
              responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
              },
              responseTemplates: {
                "application/json":
                  '{ "error": "BadRequest", "error_detail": "$context.error.validationErrorString" }\n',
              },
            },
            DEFAULT_5XX: {
              statusCode: 500,
              responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
              },
              responseTemplates: {
                "application/json":
                  '{ "error": "InternalFailure", "error_detail": "$context.error.message" }\n',
              },
            },
            ACCESS_DENIED: {
              statusCode: 403,
              responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
              },
              responseTemplates: {
                "application/json": '{ "error": "AccessDenied" }\n',
              },
            },
            UNAUTHORIZED: {
              statusCode: 403,
              responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
              },
              responseTemplates: {
                "application/json": '{ "error": "AccessDenied" }\n',
              },
            },
            MISSING_AUTHENTICATION_TOKEN: {
              statusCode: 403,
              responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
              },
              responseTemplates: {
                "application/json": '{ "error": "AccessDenied" }\n',
              },
            },
            INTEGRATION_FAILURE: {
              statusCode: 500,
              responseParameters: {
                "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
              },
              responseTemplates: {
                "application/json":
                  '{ "error": "InternalFailure", "error_detail": "An error occurred on the server side." }\n',
              },
            },
          },
          paths: {
            "/applications": {
              options: {
                consumes: ["application/json"],
                produces: ["application/json"],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                    headers: {
                      "Access-Control-Allow-Origin": {
                        type: "string",
                      },
                      "Access-Control-Allow-Methods": {
                        type: "string",
                      },
                      "Access-Control-Allow-Headers": {
                        type: "string",
                      },
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  responses: {
                    default: {
                      statusCode: "200",
                      responseParameters: {
                        "method.response.header.Access-Control-Allow-Methods":
                          "'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT'",
                        "method.response.header.Access-Control-Allow-Headers":
                          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
                        "method.response.header.Access-Control-Allow-Origin":
                          "'*'",
                      },
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  requestTemplates: {
                    "application/json": '{"statusCode": 200}',
                  },
                  type: "mock",
                },
              },
              "x-amazon-apigateway-any-method": {
                produces: ["application/json"],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  uri: `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}:lambda:path/2015-03-31/functions/${props.applicationAdminServiceFunction.functionArn}/invocations`,
                  responses: {
                    default: {
                      statusCode: "200",
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  httpMethod: "POST",
                  contentHandling: "CONVERT_TO_TEXT",
                  type: "aws_proxy",
                  credentials: apiGatewayRole.roleArn,
                },
              },
            },
            "/applications/{applicationId}": {
              options: {
                consumes: ["application/json"],
                produces: ["application/json"],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                    headers: {
                      "Access-Control-Allow-Origin": {
                        type: "string",
                      },
                      "Access-Control-Allow-Methods": {
                        type: "string",
                      },
                      "Access-Control-Allow-Headers": {
                        type: "string",
                      },
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  responses: {
                    default: {
                      statusCode: "200",
                      responseParameters: {
                        "method.response.header.Access-Control-Allow-Methods":
                          "'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT'",
                        "method.response.header.Access-Control-Allow-Headers":
                          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
                        "method.response.header.Access-Control-Allow-Origin":
                          "'*'",
                      },
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  requestTemplates: {
                    "application/json": '{"statusCode": 200}',
                  },
                  type: "mock",
                },
              },
              "x-amazon-apigateway-any-method": {
                produces: ["application/json"],
                parameters: [
                  {
                    name: "applicationId",
                    in: "path",
                    required: true,
                    type: "string",
                  },
                ],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  uri: `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}:lambda:path/2015-03-31/functions/${props.applicationAdminServiceFunction.functionArn}/invocations`,
                  responses: {
                    default: {
                      statusCode: "200",
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  httpMethod: "POST",
                  contentHandling: "CONVERT_TO_TEXT",
                  type: "aws_proxy",
                  credentials: apiGatewayRole.roleArn,
                },
              },
            },
            "/applications/{applicationId}/authorizations": {
              options: {
                consumes: ["application/json"],
                produces: ["application/json"],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                    headers: {
                      "Access-Control-Allow-Origin": {
                        type: "string",
                      },
                      "Access-Control-Allow-Methods": {
                        type: "string",
                      },
                      "Access-Control-Allow-Headers": {
                        type: "string",
                      },
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  responses: {
                    default: {
                      statusCode: "200",
                      responseParameters: {
                        "method.response.header.Access-Control-Allow-Methods":
                          "'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT'",
                        "method.response.header.Access-Control-Allow-Headers":
                          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
                        "method.response.header.Access-Control-Allow-Origin":
                          "'*'",
                      },
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  requestTemplates: {
                    "application/json": '{"statusCode": 200}',
                  },
                  type: "mock",
                },
              },
              "x-amazon-apigateway-any-method": {
                produces: ["application/json"],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  uri: `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}:lambda:path/2015-03-31/functions/${props.applicationAdminServiceFunction.functionArn}/invocations`,
                  responses: {
                    default: {
                      statusCode: "200",
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  httpMethod: "POST",
                  contentHandling: "CONVERT_TO_TEXT",
                  type: "aws_proxy",
                  credentials: apiGatewayRole.roleArn,
                },
              },
            },
            "/applications/{applicationId}/authorizations/{apiKeyId}": {
              options: {
                consumes: ["application/json"],
                produces: ["application/json"],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                    headers: {
                      "Access-Control-Allow-Origin": {
                        type: "string",
                      },
                      "Access-Control-Allow-Methods": {
                        type: "string",
                      },
                      "Access-Control-Allow-Headers": {
                        type: "string",
                      },
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  responses: {
                    default: {
                      statusCode: "200",
                      responseParameters: {
                        "method.response.header.Access-Control-Allow-Methods":
                          "'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT'",
                        "method.response.header.Access-Control-Allow-Headers":
                          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
                        "method.response.header.Access-Control-Allow-Origin":
                          "'*'",
                      },
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  requestTemplates: {
                    "application/json": '{"statusCode": 200}',
                  },
                  type: "mock",
                },
              },
              "x-amazon-apigateway-any-method": {
                produces: ["application/json"],
                responses: {
                  "200": {
                    description: "200 response",
                    schema: {
                      $ref: "#/definitions/Empty",
                    },
                  },
                },
                security: [
                  {
                    sigv4: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  uri: `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}:lambda:path/2015-03-31/functions/${props.applicationAdminServiceFunction.functionArn}/invocations`,
                  responses: {
                    default: {
                      statusCode: "200",
                    },
                  },
                  passthroughBehavior: "when_no_match",
                  httpMethod: "POST",
                  contentHandling: "CONVERT_TO_TEXT",
                  type: "aws_proxy",
                  credentials: apiGatewayRole.roleArn,
                },
              },
            },
            "/applications/{applicationId}/events": {
              post: {
                operationId: "SendEvents",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/GameEventsBatchSchema",
                      },
                    },
                  },
                  required: true,
                },
                "x-amazon-apigateway-request-validator": "all",
                responses: {
                  "200": {
                    description: "Successful POST /events",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/GameEventSuccessResponse",
                        },
                      },
                    },
                  },
                  "400": {
                    description: "Bad Request Exception",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/ErrorException",
                        },
                      },
                    },
                  },
                  "401": {
                    description: "Unauthorized Exception",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/ErrorException",
                        },
                      },
                    },
                  },
                  "500": {
                    description: "Internal Server Error",
                    content: {
                      "application/json": {
                        schema: {
                          $ref: "#/components/schemas/ErrorException",
                        },
                      },
                    },
                  },
                },
                security: [
                  {
                    lambda_authorizer: [],
                  },
                ],
                "x-amazon-apigateway-integration": {
                  uri: `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}:kinesis:action/PutRecords`,
                  credentials: apiGatewayRole.roleArn,
                  passthroughBehavior: "never",
                  httpMethod: "POST",
                  type: "aws",
                  requestParameters: {
                    "integration.request.header.Content-Type":
                      "'x-amz-json-1.1'",
                  },
                  requestTemplates: {
                    "application/json": `
                    {
                      "StreamName": "${props.gameEventsStream.streamName}",
                      "Records": [
                        #set($i = 0)
                        #foreach($event in $input.path('$.events'))
                          #set($data = $input.json("$.events[$i]"))
                          #set($output = "{
                            ""event"": $data,
                            ""aws_ga_api_validated_flag"": true,
                            ""aws_ga_api_requestId"": ""$context.requestId"",
                            ""aws_ga_api_requestTimeEpoch"": $context.requestTimeEpoch,
                            ""application_id"": ""$util.escapeJavaScript($input.params().path.get('applicationId'))""
                          }" )
                          {
                            "Data": "$util.base64Encode($output)",
                            "PartitionKey": "$event.event_id"
                          }#if($foreach.hasNext),#end
                          #set($i = $i + 1)
                        #end
                      ]
                    }
                    `,
                  },
                  responses: {
                    default: {
                      statusCode: "200",
                      responseTemplates: {
                        "application/json":
                          '#set($response = $input.path(\'$\')) #set($records = $input.json(\'$.Records\')) { "Total": $response.Records.size(), "FailedRecordCount": $input.json(\'$.FailedRecordCount\'), "Events": [#foreach($record in $response.Records){#if($record.ErrorCode != $null)"Result": "Error", "ErrorCode": "$record.ErrorCode"}#else"Result": "Ok"}#end#if($foreach.hasNext),#end#end] }\n',
                      },
                    },
                    "4\\d{2}": {
                      statusCode: "400",
                      responseTemplates: {
                        "application/json":
                          '#set($inputRoot = $input.path(\'$\')) { "error": "BadRequest", "error_detail": $input.json(\'$.message\') }\n',
                      },
                    },
                    "5\\d{2}": {
                      statusCode: "500",
                      responseTemplates: {
                        "application/json":
                          "#set($inputRoot = $input.path('$'))  { \"error\": $input.json('$.__type'), \"error_detail\": $input.json('$.message') }\n",
                      },
                    },
                  },
                },
              },
            },
          },
          components: {
            schemas: {
              ErrorException: {
                type: "object",
                properties: {
                  error: {
                    type: "string",
                    description: "Error code from the API",
                  },
                  error_detail: {
                    type: "string",
                    description: "Error message",
                  },
                },
              },
              GameEventSuccessResponse: {
                type: "object",
                title: "Game Event Success Response Schema",
                properties: {
                  Total: {
                    type: "number",
                    description:
                      "Total number of events that were processed in the request",
                  },
                  FailedRecordCount: {
                    type: "number",
                    description:
                      "Number of events that failed to be saved to game events stream",
                  },
                  Events: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/GameEventSuccessResponseRecord",
                    },
                  },
                },
              },
              GameEventSuccessResponseRecord: {
                type: "object",
                properties: {
                  Result: {
                    type: "string",
                    description: "Processing result for the input record",
                  },
                  ErrorCode: {
                    type: "string",
                    description:
                      "The error code from the game events stream. Value set if Result is Error.",
                  },
                },
              },
              GameEventsBatchSchema: {
                type: "object",
                title: "Game Analytics Batched Events Schema",
                required: ["events"],
                properties: {
                  events: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/GameEventSchema",
                    },
                  },
                },
              },
              GameEventSchema: {
                type: "object",
                title: "Game Analytics API Event Schema",
                additionalProperties: false,
                description: "Game Event sent to the Solution API",
                required: [
                  "event_id",
                  "event_type",
                  "event_name",
                  "event_timestamp",
                ],
                properties: {
                  event_id: {
                    type: "string",
                    pattern:
                      "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                    description:
                      "A random UUID that uniquely identifies an event.",
                  },
                  event_type: {
                    type: "string",
                    pattern: "^[A-Za-z0-9-_.]+$",
                    description: "Identifies the type of event",
                  },
                  event_name: {
                    type: "string",
                    pattern: "^[A-Za-z0-9-_.]+$",
                    description: "Name of the event that occurred",
                  },
                  event_version: {
                    type: "string",
                    pattern: "^[A-Za-z0-9-_.]+$",
                    description: "An API version for this event format.",
                  },
                  app_version: {
                    type: "string",
                    pattern: "^[A-Za-z0-9-_.]+$",
                    description:
                      "Version identifier for the application that generated the event",
                  },
                  event_timestamp: {
                    type: "number",
                    description:
                      "The time in seconds since the Unix epoch at which this event occurred (set by producer of event).",
                  },
                  event_data: {
                    type: "object",
                  },
                },
              },
            },
            securitySchemes: {
              lambda_authorizer: {
                type: "apiKey",
                name: "Authorization",
                in: "header",
                "x-amazon-apigateway-authtype": "custom",
                "x-amazon-apigateway-authorizer": {
                  authorizerUri: `arn:${cdk.Aws.PARTITION}:apigateway:${cdk.Aws.REGION}:lambda:path/2015-03-31/functions/${props.lambdaAuthorizer.functionArn}/invocations`,
                  authorizerCredentials: apiGatewayRole.roleArn,
                  authorizerResultTtlInSeconds: 300,
                  identitySource: "method.request.header.Authorization",
                  type: "request",
                },
              },
              sigv4: {
                type: "apiKey",
                name: "Authorization",
                in: "header",
                "x-amazon-apigateway-authtype": "awsSigv4",
              },
            },
          },
        }),
      }
    );

    const apiGatewayPushToCloudWatchRole = new iam.Role(
      this,
      "ApiGatewayPushToCloudWatchRole",
      {
        assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AmazonAPIGatewayPushToCloudWatchLogs"
          ),
        ],
      }
    );

    new apigateway.CfnAccount(this, "ApiAccount", {
      cloudWatchRoleArn: apiGatewayPushToCloudWatchRole.roleArn,
    });

    // Gives permission for API gateway to call necessary lambda
    const applicationAdminServiceExecutionPermission =
      new cdk.aws_lambda.CfnPermission(
        this,
        "ApplicationAdminServiceExecutionPermission",
        {
          action: "lambda:InvokeFunction",
          functionName: props.applicationAdminServiceFunction.functionArn,
          principal: "apigateway.amazonaws.com",
          sourceArn: `arn:${cdk.Aws.PARTITION}:execute-api:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${gameAnalyticsApi.restApiName}/*/*/applications/*`,
        }
      );

    this.gameAnalyticsApi = gameAnalyticsApi;

    new cdk.CfnOutput(this, "ApiBasePath", {
      description: "The base path of the Solution API",
      value: `${gameAnalyticsApi.domainName}/${gameAnalyticsApi.deploymentStage.stageName}`,
    });

    new cdk.CfnOutput(this, "ApiGatewayExecutionLogs", {
      description: "CloudWatch Log Group containing the API execution logs",
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#logsV2:log-groups/log-group/API-Gateway-Execution-Logs_${gameAnalyticsApi.restApiId}%252F${gameAnalyticsApi.deploymentStage.stageName}`,
    });
  }
}
