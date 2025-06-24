/**
 * Copyright 2023 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the 'License').
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the 'license' file accompanying this file. This file is distributed
 * on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as events from "aws-cdk-lib/aws-events";
import * as eventstargets from "aws-cdk-lib/aws-events-targets";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import { RedshiftConstruct } from "./redshift-construct";
import { Stack } from "aws-cdk-lib";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface LambdaConstructProps extends cdk.StackProps {
  applicationsTable: cdk.aws_dynamodb.TableV2;
  authorizationsTable: cdk.aws_dynamodb.TableV2;
  config: GameAnalyticsPipelineConfig;
  redshiftConstruct?: RedshiftConstruct;
  gamesEventsStream?: cdk.aws_kinesis.Stream;
}

const defaultProps: Partial<LambdaConstructProps> = {};

/**
 * Deploys the Lambda construct
 */
export class LambdaConstruct extends Construct {
  public readonly eventsProcessingFunction: lambda.Function;
  public readonly lambdaAuthorizer: lambda.Function;
  public readonly applicationAdminServiceFunction: lambda.Function;

  constructor(parent: Construct, name: string, props: LambdaConstructProps) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    const codePath = "../../../../business-logic";

    /* The following variables define the necessary resources for the `EventsProcessingFunction` serverless
function. This function to process and transform raw events before they get written to S3. */
    this.eventsProcessingFunction = new NodejsFunction(
      this,
      "EventsProcessingFunction",
      {
        description:
          "Function to process and transform raw events before they get written to S3",
        entry: path.join(__dirname, `${codePath}/events-processing/index.js`),
        depsLockFilePath: path.join(
          __dirname,
          `${codePath}/events-processing/package-lock.json`
        ),
        memorySize: 256,
        timeout: cdk.Duration.minutes(5),
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: {
          APPLICATIONS_TABLE: props.applicationsTable.tableName,
          CACHE_TIMEOUT_SECONDS: "60",
        },
      }
    );

    this.lambdaAuthorizer = new NodejsFunction(this, "LambdaAuthorizer", {
      description:
        "API Gateway Lambda Authorizer used to validate requests to solution /events API endpoint.",
      entry: path.join(__dirname, `${codePath}/api/lambda-authorizer/index.js`),
      depsLockFilePath: path.join(
        __dirname,
        `${codePath}/api/lambda-authorizer/package-lock.json`
      ),
      memorySize: 128,
      timeout: cdk.Duration.seconds(60),
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        AUTHORIZATIONS_TABLE: props.authorizationsTable.tableName,
        APPLICATION_AUTHORIZATIONS_INDEX: "ApplicationAuthorizations",
        APPLICATIONS_TABLE: props.applicationsTable.tableName,
      },
    });

    let redshiftEnv = {};
    if (props.redshiftConstruct) {
      redshiftEnv = {
        SECRET_ARN: `redshift!${props.redshiftConstruct.namespace.namespaceName}-admin`,
        WORKGROUP_NAME: props.redshiftConstruct.workgroup.workgroupName,
        DATABASE_NAME: props.config.EVENTS_DATABASE,
        REDSHIFT_ROLE_ARN: props.redshiftConstruct.redshiftRole.roleArn,
        STREAM_NAME: props.gamesEventsStream?.streamName ?? "",
      };
    }

    /* The following variables define the necessary resources for the `ApplicationAdminServiceFunction`.
This function provides the application admin microservice. */
    this.applicationAdminServiceFunction = new NodejsFunction(
      this,
      "ApplicationAdminServiceFunction",
      {
        description:
          "This function provides the application admin microservice.",
        code: lambda.Code.fromAsset(
          path.join(__dirname, `${codePath}/api/admin/`)
        ),
        handler: "index.handler",
        memorySize: 128,
        timeout: cdk.Duration.seconds(60),
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: {
          AUTHORIZATIONS_TABLE: props.authorizationsTable.tableName,
          APPLICATION_AUTHORIZATIONS_INDEX: "ApplicationAuthorizations",
          APPLICATIONS_TABLE: props.applicationsTable.tableName,
          INGEST_MODE: props.config.INGEST_MODE,
          DATA_PLATFORM_MODE: props.config.DATA_PLATFORM_MODE,
          ...redshiftEnv,
        },
      }
    );

    if (props.redshiftConstruct) {
      const secretArn = `arn:aws:secretsmanager:${Stack.of(this).region}:${
        Stack.of(this).account
      }:secret:redshift!${
        props.redshiftConstruct.namespace.namespaceName
      }-admin*`;

      this.applicationAdminServiceFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "DataAPI",
          effect: iam.Effect.ALLOW,
          actions: [
            "redshift-data:GetStatementResult",
            "redshift-data:ListStatements",
            "redshift-data:ExecuteStatement",
            "redshift-data:BatchExecuteStatement",
          ],
          resources: ["*"],
        })
      );

      this.applicationAdminServiceFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "DataAPIStatements",
          effect: iam.Effect.ALLOW,
          actions: [
            "redshift-data:CancelStatement",
            "redshift-data:DescribeStatement",
          ],
          resources: ["*"],
        })
      );

      this.applicationAdminServiceFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "SecretsManager",
          effect: iam.Effect.ALLOW,
          actions: ["secretsmanager:GetSecretValue"],
          resources: [secretArn],
        })
      );

      this.applicationAdminServiceFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "KMS",
          effect: iam.Effect.ALLOW,
          actions: ["kms:Decrypt*"],
          resources: [props.redshiftConstruct.key.keyArn],
        })
      );
    }
  }
}
