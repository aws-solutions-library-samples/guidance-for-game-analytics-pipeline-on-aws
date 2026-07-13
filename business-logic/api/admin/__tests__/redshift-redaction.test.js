'use strict';

const { redactSqlStatement } = require('../lib/log-sanitizer');

describe('redshift ARN redaction', () => {
  test('redacts account ID in IAM_ROLE ARN within schema statement', () => {
    const stmt =
      "CREATE EXTERNAL SCHEMA IF NOT EXISTS kds FROM KINESIS IAM_ROLE 'arn:aws:iam::123456789012:role/my-role';";
    const redacted = redactSqlStatement(stmt);
    expect(redacted).not.toContain('123456789012');
    expect(redacted).toContain('****9012');
    expect(redacted).toContain('arn:aws:iam::');
  });

  test('leaves materialized view statement unchanged (no ARN)', () => {
    const stmt = 'CREATE MATERIALIZED VIEW event_data AUTO REFRESH YES AS SELECT refresh_time FROM kds."my-stream";';
    const redacted = redactSqlStatement(stmt);
    expect(redacted).toBe(stmt);
  });

  test('redacts multiple ARNs in a single statement', () => {
    const stmt =
      "GRANT USAGE ON SCHEMA kds TO ROLE 'arn:aws:iam::111122223333:role/role-a'; GRANT SELECT ON ALL TABLES IN SCHEMA kds TO ROLE 'arn:aws:iam::111122223333:role/role-b';";
    const redacted = redactSqlStatement(stmt);
    expect(redacted).not.toContain('111122223333');
    expect((redacted.match(/\*\*\*\*3333/g) || []).length).toBe(2);
  });

  test('returns non-string input unchanged', () => {
    expect(redactSqlStatement(null)).toBeNull();
    expect(redactSqlStatement(undefined)).toBeUndefined();
    expect(redactSqlStatement(42)).toBe(42);
  });

  test('redacts regional ARN in a failed DescribeStatement result before logging', () => {
    const failedResult = {
      Id: 'stmt-1234',
      Status: 'FAILED',
      Error: 'ERROR: could not assume role',
      QueryString:
        "CREATE EXTERNAL SCHEMA kds FROM KINESIS IAM_ROLE 'arn:aws:redshift:us-east-1:123456789012:dbuser:cluster/admin';",
    };

    const safeResult = {
      ...failedResult,
      QueryString: redactSqlStatement(failedResult.QueryString),
      Error: redactSqlStatement(failedResult.Error),
    };
    const logged = JSON.stringify(safeResult);

    expect(logged).not.toContain('123456789012');
    expect(logged).toContain('****9012');
    expect(logged).toContain('arn:aws:redshift:us-east-1:');
    expect(logged).toContain('"Status":"FAILED"');
    expect(logged).toContain('"Id":"stmt-1234"');
  });
});
