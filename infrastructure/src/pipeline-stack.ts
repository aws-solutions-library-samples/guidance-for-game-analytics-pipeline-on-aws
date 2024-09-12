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
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as cdkPipelines from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "./helpers/config-types";
import { InfrastructureStack } from "./app-stack";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface PipelineStackProps extends cdk.StackProps {
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<PipelineStackProps> = {};

/**
 * Deploys the Pipeline Stack
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    const pipelineSource = cdkPipelines.CodePipelineSource.connection(
      props.config.GITHUB_USERNAME + "/" + props.config.GITHUB_REPO_NAME,
      "main",
      {
        connectionArn: props.config.CONNECTION_ARN
      }
    );

    // Buildpsec used for synth
    const buildSpec = {
      phases: {
        install: {
          "runtime-version": {
            nodejs: props.config.NODE_VERSION,
            python: props.config.PYTHON_VERSION,
          },
        },
      },
    };

    // Synth step runs npm steps to get proper output needed by cdk pipelines
    const synth = new cdkPipelines.CodeBuildStep("Synth", {
      input: pipelineSource,
      partialBuildSpec: codebuild.BuildSpec.fromObject(buildSpec),
      commands: ["npm run build"],
      primaryOutputDirectory: "infrastructure/cdk.out",
    });

    // Deployment pipeline
    const pipeline = new cdkPipelines.CodePipeline(this, "Pipeline", {
      synth,
      // cliVersion: props.config.CDK_VERSION,
      crossAccountKeys: true,
      dockerEnabledForSynth: true,
    });

    // Creates a deployment stage for each stage in config
    props.config.accounts.forEach(({ NAME, ACCOUNT, REGION }) => {
      this.addStage(pipeline, NAME, ACCOUNT, REGION, props.config);
    });
  }

  // Add a deployment stage
  addStage(
    pipeline: cdkPipelines.CodePipeline,
    stageName: string,
    stageAccount: string,
    stageRegion: string,
    config: GameAnalyticsPipelineConfig
  ) {
    const stageConstruct = new cdk.Stage(this, stageName, {
      env: {
        account: stageAccount,
        region: stageRegion,
      },
    });

    const deploymentStep = new InfrastructureStack(
      stageConstruct,
      config.WORKLOAD_NAME,
      {
        config,
      }
    );

    // If QA we will add an approval stage after
    if (stageName === "QA") {
      const manualApprovalStep = new cdkPipelines.ManualApprovalStep(
        "ProductionApproval",
        {
          comment:
            "Reviewed Test Results and Approve/Reject for Production Deployment?",
        }
      );

      pipeline.addStage(stageConstruct, {
        post: [manualApprovalStep],
      });
    } else {
      pipeline.addStage(stageConstruct);
    }
  }
}