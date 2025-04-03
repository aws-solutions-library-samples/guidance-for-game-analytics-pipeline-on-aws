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
import * as ec2 from "aws-cdk-lib/aws-ec2"
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface VpcConstructProps extends cdk.StackProps {
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<VpcConstructProps> = {};

/**
 * Deploys the VPC construct
 *
 * If the solution needs to deploy VPCs (i.e. MSK or Redshift), a default one is created
 */
export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  constructor(parent: Construct, name: string, props: VpcConstructProps) {
    super(parent, name);

    const vpc = new ec2.Vpc(this, "VPC", {});

    this.vpc = vpc;
  }
}