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
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as msk from "aws-cdk-lib/aws-msk";

import * as path from "path";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface MSKConstructProps extends cdk.StackProps {
  /**
   * Base Codepath for business logic folder
   */
  baseCodePath: string;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<MSKConstructProps> = {};

/**
 * Deploys the Managed Flink construct
 *
 * Creates Managed Flink application, the aggregated metric output stream, as well as the Lambda Function for processing Managed Flink output sent to the aggregated metric output stream. 
 * Enables logging on the Managed Flink application and stores logs in a namespace for the application
 * starts the Managed Flink app automatically using a custom resource
 */
export class MSKConstruct extends Construct {

  constructor(
    parent: Construct,
    name: string,
    props: MSKConstructProps
  ) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };
    const codePath = `../${props.baseCodePath}`;

  }
}
