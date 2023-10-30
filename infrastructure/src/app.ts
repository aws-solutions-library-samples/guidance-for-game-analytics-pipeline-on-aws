#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { InfrastructureStack } from "./app-stack";
import { getConfig } from "./helpers/stack-config-loader";
import { PipelineStack } from "./pipeline-stack";

const app = new cdk.App();
const config = getConfig();

// Checks for prod and QA account information
const prod = config.accounts.find(({ NAME }) => NAME === "PROD");
const qa = config.accounts.find(({ NAME }) => NAME === "QA");

// Defaults to local deployment information
const account =
    app.node.tryGetContext("account") ||
    process.env.CDK_DEPLOY_ACCOUNT ||
    process.env.CDK_DEFAULT_ACCOUNT ||
    qa?.ACCOUNT;

const region =
    app.node.tryGetContext("region") ||
    process.env.CDK_DEPLOY_REGION ||
    process.env.CDK_DEFAULT_REGION ||
    qa?.REGION;

const env = { region, account };

// Core infrastructure
new InfrastructureStack(app, "CentralizedGameAnalytics", {
    stackName: `${prod?.NAME}-${config.WORKLOAD_NAME}`,
    description : "Guidance for the Game Analytics Pipeline on AWS (SO0096)",
    config,
    env,
});

// Deployment through pipeline
new PipelineStack(app, "PipelineStack", {
    stackName: `${config.WORKLOAD_NAME}-Toolchain`,
    description : "Guidance for the Game Analytics Pipeline on AWS (SO0096)",
    config,
    env,
});
