'use strict';

// fallow-ignore-file security-sink
//
// Justification (audit remediation 2026-06-16):
// The console.log calls in this file emit operational identifiers — VPC connection IDs,
// IAM role names, and workload-prefixed resource names — for cdk-destroy debugging.
// These values are sourced from process.env but are NOT credentials:
//   - QUICKSIGHT_VPC_CONNECTION_ID: workload-prefixed VPC connection identifier
//   - QUICKSIGHT_ROLE_NAME: CDK-generated IAM role name (no embedded account ID)
//   - WORKLOAD_NAME: stack workload name (already in CloudFormation output names)
//   - ACCOUNT_ID: only used in SDK calls (resource ARN construction), never logged directly
// The teardown is invoked via `aws lambda invoke` (scripts/pre-destroy.js) and its
// output is read by the operator running `cdk destroy` — these logs ARE the debug surface.
// Removing them blinds the operator during ENI cleanup failures.

const { QuickSightClient } = require('@aws-sdk/client-quicksight');
const { IAMClient } = require('@aws-sdk/client-iam');
const {
  deleteVpcConnection,
  waitForVpcDeletion,
  cleanupIamRolePolicies,
  deleteIamRole,
} = require('./quicksight-teardown-helpers');

async function teardownQuickSight() {
  const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || process.env.ACCOUNT_ID;
  const VPC_CONNECTION_ID = process.env.QUICKSIGHT_VPC_CONNECTION_ID;
  const QS_ROLE_NAME = process.env.QUICKSIGHT_ROLE_NAME;
  const WORKLOAD_NAME = process.env.WORKLOAD_NAME;

  if (!VPC_CONNECTION_ID) {
    return { Result: 'SKIPPED', Message: 'QUICKSIGHT_VPC_CONNECTION_ID not configured' };
  }

  if (!ACCOUNT_ID) {
    return Promise.reject({
      code: 400,
      error: 'BadRequest',
      message: 'AWS_ACCOUNT_ID or ACCOUNT_ID environment variable is required',
    });
  }

  if (WORKLOAD_NAME && !VPC_CONNECTION_ID.includes(WORKLOAD_NAME)) {
    return Promise.reject({
      code: 400,
      error: 'OwnershipError',
      message: `VPC connection ID "${VPC_CONNECTION_ID}" does not contain workload name "${WORKLOAD_NAME}". Aborting to prevent deleting foreign resources.`,
    });
  }

  const qsClient = new QuickSightClient({});
  const iamClient = new IAMClient({});
  const results = [];

  results.push(await deleteVpcConnection(qsClient, ACCOUNT_ID, VPC_CONNECTION_ID));

  let waitResult;
  try {
    waitResult = await waitForVpcDeletion(qsClient, ACCOUNT_ID, VPC_CONNECTION_ID, 60);
  } catch (err) {
    if (err._step) results.push(err._step);
    const { _step: _, ...rejection } = err;
    return Promise.reject(rejection);
  }
  results.push(waitResult);
  console.log('VPC connection deleted successfully');

  results.push(await deleteIamRole(iamClient, QS_ROLE_NAME, WORKLOAD_NAME));

  return { Result: 'OK', Steps: results };
}

module.exports = { teardownQuickSight };
