'use strict';

const { mockClient } = require('aws-sdk-client-mock');
const {
  QuickSightClient,
  DeleteVPCConnectionCommand,
  DescribeVPCConnectionCommand,
} = require('@aws-sdk/client-quicksight');
const {
  IAMClient,
  ListRolePoliciesCommand,
  ListAttachedRolePoliciesCommand,
  DeleteRolePolicyCommand,
  DetachRolePolicyCommand,
  DeleteRoleCommand,
} = require('@aws-sdk/client-iam');

const qsMock = mockClient(QuickSightClient);
const iamMock = mockClient(IAMClient);

const {
  deleteVpcConnection,
  waitForVpcDeletion,
  cleanupIamRolePolicies,
  deleteIamRole,
} = require('../lib/quicksight-teardown-helpers');

describe('deleteVpcConnection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    qsMock.reset();
  });
  afterEach(() => jest.useRealTimers());

  it('returns INITIATED on success', async () => {
    qsMock.on(DeleteVPCConnectionCommand).resolves({});
    const result = await deleteVpcConnection(new QuickSightClient({}), '123', 'conn-1');
    expect(result).toMatchObject({ step: 'DeleteVPCConnection', status: 'INITIATED' });
  });

  it('returns ALREADY_DELETED on ResourceNotFoundException', async () => {
    qsMock
      .on(DeleteVPCConnectionCommand)
      .rejects(Object.assign(new Error('nf'), { name: 'ResourceNotFoundException' }));
    const result = await deleteVpcConnection(new QuickSightClient({}), '123', 'conn-1');
    expect(result).toMatchObject({ step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' });
  });

  it('returns ALREADY_DELETED on ConflictException with "deleted"', async () => {
    qsMock
      .on(DeleteVPCConnectionCommand)
      .rejects(Object.assign(new Error('already deleted'), { name: 'ConflictException' }));
    const result = await deleteVpcConnection(new QuickSightClient({}), '123', 'conn-1');
    expect(result).toMatchObject({ step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' });
  });

  it('rejects with QuickSightError on other errors', async () => {
    qsMock
      .on(DeleteVPCConnectionCommand)
      .rejects(Object.assign(new Error('access denied'), { name: 'AccessDeniedException' }));
    await expect(deleteVpcConnection(new QuickSightClient({}), '123', 'conn-1')).rejects.toMatchObject({
      code: 500,
      error: 'QuickSightError',
    });
  });
});

describe('waitForVpcDeletion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    qsMock.reset();
  });
  afterEach(() => jest.useRealTimers());

  it('returns DELETED when status is DELETED', async () => {
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETED' } });
    const promise = waitForVpcDeletion(new QuickSightClient({}), '123', 'conn-1', 5);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toMatchObject({ step: 'WaitForDeletion', status: 'DELETED' });
  });

  it('returns DELETED when ResourceNotFoundException during poll', async () => {
    qsMock
      .on(DescribeVPCConnectionCommand)
      .rejects(Object.assign(new Error('nf'), { name: 'ResourceNotFoundException' }));
    const promise = waitForVpcDeletion(new QuickSightClient({}), '123', 'conn-1', 5);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toMatchObject({ step: 'WaitForDeletion', status: 'DELETED' });
  });

  it('rejects with QuickSightError when DELETION_FAILED', async () => {
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETION_FAILED' } });
    const rejectPromise = expect(
      waitForVpcDeletion(new QuickSightClient({}), '123', 'conn-1', 5),
    ).rejects.toMatchObject({
      code: 500,
      error: 'QuickSightError',
    });
    await jest.runAllTimersAsync();
    await rejectPromise;
  });

  it('rejects with TimeoutError when maxAttempts exhausted', async () => {
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETING' } });
    const rejectPromise = expect(
      waitForVpcDeletion(new QuickSightClient({}), '123', 'conn-1', 2),
    ).rejects.toMatchObject({
      code: 500,
      error: 'TimeoutError',
    });
    await jest.runAllTimersAsync();
    await rejectPromise;
  });
});

describe('cleanupIamRolePolicies', () => {
  beforeEach(() => iamMock.reset());

  it('deletes inline policies and detaches managed policies', async () => {
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: ['inline-1'] });
    iamMock.on(DeleteRolePolicyCommand).resolves({});
    iamMock
      .on(ListAttachedRolePoliciesCommand)
      .resolves({ AttachedPolicies: [{ PolicyArn: 'arn:aws:iam::123:policy/managed-1' }] });
    iamMock.on(DetachRolePolicyCommand).resolves({});

    await cleanupIamRolePolicies(new IAMClient({}), 'my-role');

    const deleteCalls = iamMock.commandCalls(DeleteRolePolicyCommand);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].args[0].input).toMatchObject({ RoleName: 'my-role', PolicyName: 'inline-1' });

    const detachCalls = iamMock.commandCalls(DetachRolePolicyCommand);
    expect(detachCalls).toHaveLength(1);
    expect(detachCalls[0].args[0].input).toMatchObject({
      RoleName: 'my-role',
      PolicyArn: 'arn:aws:iam::123:policy/managed-1',
    });
  });

  it('handles no policies gracefully', async () => {
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    await cleanupIamRolePolicies(new IAMClient({}), 'my-role');
    expect(iamMock.commandCalls(DeleteRolePolicyCommand)).toHaveLength(0);
    expect(iamMock.commandCalls(DetachRolePolicyCommand)).toHaveLength(0);
  });
});

describe('deleteIamRole', () => {
  beforeEach(() => iamMock.reset());

  it('returns SKIPPED when roleName is not set', async () => {
    const result = await deleteIamRole(new IAMClient({}), null, 'workload');
    expect(result).toMatchObject({ step: 'DeleteIAMRole', status: 'SKIPPED', reason: 'QUICKSIGHT_ROLE_NAME not set' });
  });

  it('returns SKIPPED when role name does not match workload', async () => {
    const result = await deleteIamRole(new IAMClient({}), 'foreign-role', 'my-workload');
    expect(result).toMatchObject({
      step: 'DeleteIAMRole',
      status: 'SKIPPED',
      reason: 'Role name does not match workload',
    });
  });

  it('returns DELETED on success', async () => {
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    iamMock.on(DeleteRoleCommand).resolves({});
    const result = await deleteIamRole(new IAMClient({}), 'my-workload-qs-role', 'my-workload');
    expect(result).toMatchObject({ step: 'DeleteIAMRole', status: 'DELETED' });
  });

  it('returns ALREADY_DELETED on NoSuchEntityException', async () => {
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    iamMock
      .on(DeleteRoleCommand)
      .rejects(Object.assign(new Error('no such entity'), { name: 'NoSuchEntityException' }));
    const result = await deleteIamRole(new IAMClient({}), 'my-workload-qs-role', 'my-workload');
    expect(result).toMatchObject({ step: 'DeleteIAMRole', status: 'ALREADY_DELETED' });
  });

  it('returns FAILED on other errors', async () => {
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    iamMock.on(DeleteRoleCommand).rejects(Object.assign(new Error('access denied'), { name: 'AccessDeniedException' }));
    const result = await deleteIamRole(new IAMClient({}), 'my-workload-qs-role', 'my-workload');
    expect(result).toMatchObject({ step: 'DeleteIAMRole', status: 'FAILED' });
  });

  it('deletes role without workload check when workloadName is not set', async () => {
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    iamMock.on(DeleteRoleCommand).resolves({});
    const result = await deleteIamRole(new IAMClient({}), 'any-role', null);
    expect(result).toMatchObject({ step: 'DeleteIAMRole', status: 'DELETED' });
  });
});
