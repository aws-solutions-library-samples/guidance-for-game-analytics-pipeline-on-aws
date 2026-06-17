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
  DeleteRoleCommand,
} = require('@aws-sdk/client-iam');

const { teardownQuickSight } = require('../lib/quicksight-teardown');

const qsMock = mockClient(QuickSightClient);
const iamMock = mockClient(IAMClient);

describe('teardownQuickSight characterization', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    qsMock.reset();
    iamMock.reset();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.AWS_ACCOUNT_ID;
    delete process.env.ACCOUNT_ID;
    delete process.env.QUICKSIGHT_VPC_CONNECTION_ID;
    delete process.env.QUICKSIGHT_ROLE_NAME;
    delete process.env.WORKLOAD_NAME;
  });

  it('happy path: VPC deleted, IAM role cleaned up, returns OK with 3 steps', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'test-workload-qs-vpc-conn-v1';
    process.env.QUICKSIGHT_ROLE_NAME = 'test-workload-qs-role';
    process.env.WORKLOAD_NAME = 'test-workload';

    qsMock.on(DeleteVPCConnectionCommand).resolves({});
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETED' } });
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    iamMock.on(DeleteRoleCommand).resolves({});

    const promise = teardownQuickSight();
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.Result).toBe('OK');
    expect(result.Steps).toHaveLength(3);
    expect(result.Steps[0]).toMatchObject({ step: 'DeleteVPCConnection', status: 'INITIATED' });
    expect(result.Steps[1]).toMatchObject({ step: 'WaitForDeletion', status: 'DELETED' });
    expect(result.Steps[2]).toMatchObject({ step: 'DeleteIAMRole', status: 'DELETED' });
  });

  it('skipped when QUICKSIGHT_VPC_CONNECTION_ID not set', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';

    const result = await teardownQuickSight();
    expect(result.Result).toBe('SKIPPED');
    expect(result.Message).toMatch(/not configured/i);
  });

  it('rejects with 400 when both AWS_ACCOUNT_ID and ACCOUNT_ID are missing', async () => {
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'test-workload-qs-vpc-conn-v1';

    await expect(teardownQuickSight()).rejects.toMatchObject({
      code: 400,
      error: 'BadRequest',
      message: expect.stringMatching(/AWS_ACCOUNT_ID or ACCOUNT_ID/i),
    });
  });

  it('rejects with OwnershipError when VPC connection ID does not contain workload name', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'foreign-workload-qs-vpc-conn-v1';
    process.env.WORKLOAD_NAME = 'my-workload';

    await expect(teardownQuickSight()).rejects.toMatchObject({
      code: 400,
      error: 'OwnershipError',
      message: expect.stringMatching(/does not contain workload name/i),
    });
  });

  it('records ALREADY_DELETED when DeleteVPCConnection throws ResourceNotFoundException', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'test-workload-qs-vpc-conn-v1';
    process.env.QUICKSIGHT_ROLE_NAME = 'test-workload-qs-role';
    process.env.WORKLOAD_NAME = 'test-workload';

    const notFound = Object.assign(new Error('Not found'), { name: 'ResourceNotFoundException' });
    qsMock.on(DeleteVPCConnectionCommand).rejects(notFound);
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETED' } });
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    iamMock.on(DeleteRoleCommand).resolves({});

    const promise = teardownQuickSight();
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.Result).toBe('OK');
    expect(result.Steps[0]).toMatchObject({ step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' });
  });

  it('records ALREADY_DELETED when DeleteVPCConnection throws ConflictException with "deleted"', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'test-workload-qs-vpc-conn-v1';
    process.env.QUICKSIGHT_ROLE_NAME = 'test-workload-qs-role';
    process.env.WORKLOAD_NAME = 'test-workload';

    const conflict = Object.assign(new Error('Resource is already deleted'), { name: 'ConflictException' });
    qsMock.on(DeleteVPCConnectionCommand).rejects(conflict);
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETED' } });
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    iamMock.on(DeleteRoleCommand).resolves({});

    const promise = teardownQuickSight();
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.Result).toBe('OK');
    expect(result.Steps[0]).toMatchObject({ step: 'DeleteVPCConnection', status: 'ALREADY_DELETED' });
  });

  it('rejects with QuickSightError when poll returns DELETION_FAILED', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'test-workload-qs-vpc-conn-v1';
    process.env.WORKLOAD_NAME = 'test-workload';

    qsMock.on(DeleteVPCConnectionCommand).resolves({});
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETION_FAILED' } });

    const rejectPromise = expect(teardownQuickSight()).rejects.toMatchObject({
      code: 500,
      error: 'QuickSightError',
      message: expect.stringMatching(/deletion failed/i),
    });
    await jest.runAllTimersAsync();
    await rejectPromise;
  });

  it('rejects with TimeoutError when poll exhausts maxAttempts', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'test-workload-qs-vpc-conn-v1';
    process.env.WORKLOAD_NAME = 'test-workload';

    qsMock.on(DeleteVPCConnectionCommand).resolves({});
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETING' } });

    const rejectPromise = expect(teardownQuickSight()).rejects.toMatchObject({
      code: 500,
      error: 'TimeoutError',
      message: expect.stringMatching(/timed out/i),
    });
    await jest.runAllTimersAsync();
    await rejectPromise;
  });

  it('records ALREADY_DELETED when IAM DeleteRole throws NoSuchEntityException', async () => {
    process.env.AWS_ACCOUNT_ID = '999988887777';
    process.env.QUICKSIGHT_VPC_CONNECTION_ID = 'test-workload-qs-vpc-conn-v1';
    process.env.QUICKSIGHT_ROLE_NAME = 'test-workload-qs-role';
    process.env.WORKLOAD_NAME = 'test-workload';

    qsMock.on(DeleteVPCConnectionCommand).resolves({});
    qsMock.on(DescribeVPCConnectionCommand).resolves({ VPCConnection: { Status: 'DELETED' } });
    iamMock.on(ListRolePoliciesCommand).resolves({ PolicyNames: [] });
    iamMock.on(ListAttachedRolePoliciesCommand).resolves({ AttachedPolicies: [] });
    const noSuchEntity = Object.assign(new Error('Role not found'), { name: 'NoSuchEntityException' });
    iamMock.on(DeleteRoleCommand).rejects(noSuchEntity);

    const promise = teardownQuickSight();
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.Result).toBe('OK');
    expect(result.Steps[2]).toMatchObject({ step: 'DeleteIAMRole', status: 'ALREADY_DELETED' });
  });

  it.skip('DELETION_IN_PROGRESS: poll should continue past transient in-progress status', () => {});
});
