#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { InfrastructureStack } from "./app-stack";
import { getConfig } from "./helpers/stack-config-loader";

const app = new cdk.App();
const config = getConfig();

// Defaults to local deployment information
const account =
    app.node.tryGetContext("account") ||
    process.env.CDK_DEPLOY_ACCOUNT ||
    process.env.CDK_DEFAULT_ACCOUNT

    const region =
    app.node.tryGetContext("region") ||
    process.env.CDK_DEPLOY_REGION ||
    process.env.CDK_DEFAULT_REGION;

const env = {region , account };

if (config.DATA_PLATFORM_MODE === "REDSHIFT" && config.INGEST_MODE === "DIRECT_BATCH") {
    throw new Error("REDSHIFT mode does not support DIRECT_BATCH, please see documentation (Design Considerations) for details.");
}

if (config.REAL_TIME_ANALYTICS === true && config.INGEST_MODE !== "KINESIS_DATA_STREAMS") {
    throw new Error("REAL TIME ANALYTICS requires KINESIS DATA STREAMS as real time ingest.");
}

// Core infrastructure
new InfrastructureStack(app, "CentralizedGameAnalytics", {
    stackName: `${config.WORKLOAD_NAME}`,
    description : "Guidance for the Game Analytics Pipeline on AWS (SO0096)",
    config,
    env
});