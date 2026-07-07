'use strict';

const { redactArn, redactSqlStatement } = require('../lib/log-sanitizer');

describe('redactArn', () => {
  test('standard ARN: account ID is redacted, last 4 digits preserved', () => {
    const input = 'arn:aws:iam::123456789012:role/foo';
    const output = redactArn(input);
    expect(output).not.toContain('123456789012');
    expect(output).toBe('arn:aws:iam::****9012:role/foo');
  });

  test('China partition ARN is redacted', () => {
    const input = 'arn:aws-cn:iam::123456789012:role/foo';
    const output = redactArn(input);
    expect(output).not.toContain('123456789012');
    expect(output).toContain('****9012');
  });

  test('GovCloud partition ARN is redacted', () => {
    const input = 'arn:aws-us-gov:iam::123456789012:role/foo';
    const output = redactArn(input);
    expect(output).not.toContain('123456789012');
    expect(output).toContain('****9012');
  });

  test('regional Secrets Manager ARN: account ID is redacted', () => {
    const input = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:redshift!ns-db-admin';
    const output = redactArn(input);
    expect(output).not.toContain('123456789012');
    expect(output).toContain('****9012');
  });

  test('multiple ARNs in one string: both account IDs redacted', () => {
    const input = 'role1=arn:aws:iam::111111111111:role/a role2=arn:aws:iam::222222222222:role/b';
    const output = redactArn(input);
    expect(output).not.toContain('111111111111');
    expect(output).not.toContain('222222222222');
    expect(output).toContain('****1111');
    expect(output).toContain('****2222');
  });

  test('string with no ARN: returned unchanged', () => {
    const input = 'SELECT * FROM events WHERE id = 42';
    expect(redactArn(input)).toBe(input);
  });

  test('already-redacted string: unchanged (idempotent)', () => {
    const once = redactArn('arn:aws:iam::123456789012:role/foo');
    const twice = redactArn(once);
    expect(once).toBe(twice);
  });

  test('empty string: returns empty string', () => {
    expect(redactArn('')).toBe('');
  });

  test('null: returns null without throwing', () => {
    expect(redactArn(null)).toBeNull();
  });

  test('undefined: returns undefined without throwing', () => {
    expect(redactArn(undefined)).toBeUndefined();
  });

  test('non-string (number): returned as-is without throwing', () => {
    expect(redactArn(42)).toBe(42);
  });
});

describe('redactSqlStatement', () => {
  test('SQL with embedded ARN: account ID never appears in output', () => {
    const sql = "COPY events FROM 's3://bucket/key' IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftRole'";
    const output = redactSqlStatement(sql);
    expect(output).not.toContain('123456789012');
    expect(output).toContain('****9012');
  });

  test('SQL without ARN: returned unchanged', () => {
    const sql = "SELECT COUNT(*) FROM game_events WHERE event_type = 'login'";
    expect(redactSqlStatement(sql)).toBe(sql);
  });
});
