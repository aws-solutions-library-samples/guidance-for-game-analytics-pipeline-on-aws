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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deleteVpcConnection(qsClient, accountId, vpcConnectionId) {
  try {
    console.log(`Deleting VPC connection: ${vpcConnectionId}`);
    await qsClient.send(
      new DeleteVPCConnectionCommand({
        AwsAccountId: accountId,
        VPCConnectionId: vpcConnectionId,
      }),
    );
    return { step: 'DeleteVPCConnection', status: 'INITIATED' };
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      console.log('VPC connection not found — already deleted');
      return { step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' };
    }
    if (err.name === 'ConflictException' && err.message?.includes('deleted')) {
      console.log('VPC connection already in deleted state');
      return { step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' };
    }
    console.log(`Error deleting VPC connection: ${JSON.stringify(err)}`);
    return Promise.reject({
      code: 500,
      error: 'QuickSightError',
      message: `Failed to delete VPC connection: ${err.message}`,
    });
  }
}

async function waitForVpcDeletion(qsClient, accountId, vpcConnectionId, maxAttempts) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const desc = await qsClient.send(
        new DescribeVPCConnectionCommand({
          AwsAccountId: accountId,
          VPCConnectionId: vpcConnectionId,
        }),
      );
      const status = desc.VPCConnection?.Status;
      console.log(`  VPC connection status: ${status} (attempt ${i + 1}/${maxAttempts})`);

      if (status === 'DELETED') {
        return { step: 'WaitForDeletion', status: 'DELETED' };
      }
      if (status === 'DELETION_FAILED') {
        return Promise.reject({
          code: 500,
          error: 'QuickSightError',
          message: 'VPC connection deletion failed. ENIs may still be attached. Check QuickSight console.',
          _step: { step: 'WaitForDeletion', status: 'DELETION_FAILED' },
        });
      }
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        return { step: 'WaitForDeletion', status: 'DELETED' };
      }
      console.log(`  Error polling VPC connection: ${err.message}`);
    }
    await sleep(5000);
  }
  return Promise.reject({
    code: 500,
    error: 'TimeoutError',
    message: 'Timed out waiting for VPC connection deletion (5 min). Retry or check console.',
    _step: { step: 'WaitForDeletion', status: 'TIMEOUT' },
  });
}

async function cleanupIamRolePolicies(iamClient, roleName) {
  const inlinePolicies = await iamClient.send(new ListRolePoliciesCommand({ RoleName: roleName }));
  for (const policyName of inlinePolicies.PolicyNames || []) {
    await iamClient.send(new DeleteRolePolicyCommand({ RoleName: roleName, PolicyName: policyName }));
    console.log(`  Deleted inline policy: ${policyName}`);
  }

  const attachedPolicies = await iamClient.send(new ListAttachedRolePoliciesCommand({ RoleName: roleName }));
  for (const policy of attachedPolicies.AttachedPolicies || []) {
    await iamClient.send(new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policy.PolicyArn }));
    console.log(`  Detached managed policy: ${policy.PolicyArn}`);
  }
}

async function deleteIamRole(iamClient, roleName, workloadName) {
  if (!roleName) {
    return { step: 'DeleteIAMRole', status: 'SKIPPED', reason: 'QUICKSIGHT_ROLE_NAME not set' };
  }
  if (workloadName && !roleName.includes(workloadName)) {
    console.log(
      `WARNING: Role "${roleName}" does not contain workload name "${workloadName}". Skipping to prevent deleting foreign resources.`,
    );
    return { step: 'DeleteIAMRole', status: 'SKIPPED', reason: 'Role name does not match workload' };
  }
  try {
    console.log(`Cleaning up retained IAM role: ${roleName}`);
    await cleanupIamRolePolicies(iamClient, roleName);
    await iamClient.send(new DeleteRoleCommand({ RoleName: roleName }));
    console.log(`  Deleted role: ${roleName}`);
    return { step: 'DeleteIAMRole', status: 'DELETED' };
  } catch (err) {
    if (err.name === 'NoSuchEntityException') {
      console.log('IAM role not found — already deleted');
      return { step: 'DeleteIAMRole', status: 'ALREADY_DELETED' };
    }
    console.log(`Warning: Failed to delete IAM role: ${err.message}`);
    return { step: 'DeleteIAMRole', status: 'FAILED', error: err.message };
  }
}

module.exports = { deleteVpcConnection, waitForVpcDeletion, cleanupIamRolePolicies, deleteIamRole };
