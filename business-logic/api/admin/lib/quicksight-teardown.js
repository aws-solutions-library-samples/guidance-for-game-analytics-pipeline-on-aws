'use strict';

const {
  QuickSightClient,
  DeleteVPCConnectionCommand,
  DescribeVPCConnectionCommand,
} = require('@aws-sdk/client-quicksight');

const {
  IAMClient,
  DeleteRolePolicyCommand,
  DeleteRoleCommand,
  ListRolePoliciesCommand,
  ListAttachedRolePoliciesCommand,
  DetachRolePolicyCommand,
} = require('@aws-sdk/client-iam');

const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID || process.env.ACCOUNT_ID;
const VPC_CONNECTION_ID = process.env.QUICKSIGHT_VPC_CONNECTION_ID;
const QS_ROLE_NAME = process.env.QUICKSIGHT_ROLE_NAME;
const WORKLOAD_NAME = process.env.WORKLOAD_NAME;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tears down QuickSight VPC connection and cleans up the retained IAM role.
 *
 * This must be called BEFORE `cdk destroy` to avoid orphaned ENIs blocking
 * subnet/VPC deletion. The IAM role is retained by CDK (RemovalPolicy.RETAIN)
 * specifically so QuickSight can use it to clean up ENIs during VPC connection deletion.
 *
 * Flow:
 * 1. Delete the VPC connection (QuickSight releases ENIs using the retained role)
 * 2. Poll until deletion completes
 * 3. Delete the retained IAM role (no longer needed)
 */
async function teardownQuickSight() {
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

  const qsClient = new QuickSightClient({});
  const iamClient = new IAMClient({});
  const results = [];

  // Ownership guard: verify VPC connection belongs to this workload
  if (WORKLOAD_NAME && !VPC_CONNECTION_ID.includes(WORKLOAD_NAME)) {
    return Promise.reject({
      code: 400,
      error: 'OwnershipError',
      message: `VPC connection ID "${VPC_CONNECTION_ID}" does not contain workload name "${WORKLOAD_NAME}". Aborting to prevent deleting foreign resources.`,
    });
  }

  // Step 1: Delete VPC Connection
  try {
    console.log(`Deleting VPC connection: ${VPC_CONNECTION_ID}`);
    await qsClient.send(new DeleteVPCConnectionCommand({
      AwsAccountId: ACCOUNT_ID,
      VPCConnectionId: VPC_CONNECTION_ID,
    }));
    results.push({ step: 'DeleteVPCConnection', status: 'INITIATED' });
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      console.log('VPC connection not found — already deleted');
      results.push({ step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' });
    } else if (err.name === 'ConflictException' && err.message?.includes('deleted')) {
      console.log('VPC connection already in deleted state');
      results.push({ step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' });
    } else {
      console.log(`Error deleting VPC connection: ${JSON.stringify(err)}`);
      return Promise.reject({
        code: 500,
        error: 'QuickSightError',
        message: `Failed to delete VPC connection: ${err.message}`,
      });
    }
  }

  // Step 2: Poll until VPC connection is fully deleted
  const maxAttempts = 60; // 5 minutes at 5s intervals
  let deleted = false;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const desc = await qsClient.send(new DescribeVPCConnectionCommand({
        AwsAccountId: ACCOUNT_ID,
        VPCConnectionId: VPC_CONNECTION_ID,
      }));
      const status = desc.VPCConnection?.Status;
      console.log(`  VPC connection status: ${status} (attempt ${i + 1}/${maxAttempts})`);

      if (status === 'DELETED') {
        deleted = true;
        break;
      } else if (status === 'DELETION_FAILED') {
        results.push({ step: 'WaitForDeletion', status: 'DELETION_FAILED' });
        return Promise.reject({
          code: 500,
          error: 'QuickSightError',
          message: 'VPC connection deletion failed. ENIs may still be attached. Check QuickSight console.',
        });
      }
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        deleted = true;
        break;
      }
      console.log(`  Error polling VPC connection: ${err.message}`);
    }
    await sleep(5000);
  }

  if (deleted) {
    results.push({ step: 'WaitForDeletion', status: 'DELETED' });
    console.log('VPC connection deleted successfully');
  } else {
    results.push({ step: 'WaitForDeletion', status: 'TIMEOUT' });
    return Promise.reject({
      code: 500,
      error: 'TimeoutError',
      message: 'Timed out waiting for VPC connection deletion (5 min). Retry or check console.',
    });
  }

  // Step 3: Clean up the retained IAM role
  if (QS_ROLE_NAME) {
    if (WORKLOAD_NAME && !QS_ROLE_NAME.includes(WORKLOAD_NAME)) {
      console.log(`WARNING: Role "${QS_ROLE_NAME}" does not contain workload name "${WORKLOAD_NAME}". Skipping to prevent deleting foreign resources.`);
      results.push({ step: 'DeleteIAMRole', status: 'SKIPPED', reason: 'Role name does not match workload' });
    } else {
      try {
        console.log(`Cleaning up retained IAM role: ${QS_ROLE_NAME}`);

        const inlinePolicies = await iamClient.send(new ListRolePoliciesCommand({
          RoleName: QS_ROLE_NAME,
        }));
        for (const policyName of (inlinePolicies.PolicyNames || [])) {
          await iamClient.send(new DeleteRolePolicyCommand({
            RoleName: QS_ROLE_NAME,
            PolicyName: policyName,
          }));
          console.log(`  Deleted inline policy: ${policyName}`);
        }

        const attachedPolicies = await iamClient.send(new ListAttachedRolePoliciesCommand({
          RoleName: QS_ROLE_NAME,
        }));
        for (const policy of (attachedPolicies.AttachedPolicies || [])) {
          await iamClient.send(new DetachRolePolicyCommand({
            RoleName: QS_ROLE_NAME,
            PolicyArn: policy.PolicyArn,
          }));
          console.log(`  Detached managed policy: ${policy.PolicyArn}`);
        }

        await iamClient.send(new DeleteRoleCommand({
          RoleName: QS_ROLE_NAME,
        }));
        console.log(`  Deleted role: ${QS_ROLE_NAME}`);
        results.push({ step: 'DeleteIAMRole', status: 'DELETED' });
      } catch (err) {
        if (err.name === 'NoSuchEntityException') {
          console.log('IAM role not found — already deleted');
          results.push({ step: 'DeleteIAMRole', status: 'ALREADY_DELETED' });
        } else {
          console.log(`Warning: Failed to delete IAM role: ${err.message}`);
          results.push({ step: 'DeleteIAMRole', status: 'FAILED', error: err.message });
        }
      }
    }
  } else {
    results.push({ step: 'DeleteIAMRole', status: 'SKIPPED', reason: 'QUICKSIGHT_ROLE_NAME not set' });
  }

  return { Result: 'OK', Steps: results };
}

module.exports = { teardownQuickSight };
