const { mockClient } = require('aws-sdk-client-mock');
const { IAMClient, ListRolesCommand } = require('@aws-sdk/client-iam');

const iamMock = mockClient(IAMClient);

describe('smoke test', () => {
  beforeEach(() => {
    iamMock.reset();
  });

  it('aws-sdk-client-mock works', async () => {
    iamMock.on(ListRolesCommand).resolves({ Roles: [] });
    const client = new IAMClient({});
    const result = await client.send(new ListRolesCommand({}));
    expect(result.Roles).toEqual([]);
    expect(iamMock.calls()).toHaveLength(1);
  });
});
