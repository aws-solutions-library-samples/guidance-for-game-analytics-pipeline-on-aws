/**
 * ARN redaction utility for safe logging.
 * Replaces AWS account IDs embedded in ARNs with partial redaction.
 */

const ARN_PATTERN = /arn:[a-z][a-z0-9-]*:[a-z0-9-]*::?(\d{12}):/g;

function redactArn(input) {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'string') return input;
  return input.replace(ARN_PATTERN, (match, accountId) => {
    const last4 = accountId.slice(-4);
    return match.replace(accountId, '****' + last4);
  });
}

function redactSqlStatement(sql) {
  return redactArn(sql);
}

module.exports = { redactArn, redactSqlStatement };
