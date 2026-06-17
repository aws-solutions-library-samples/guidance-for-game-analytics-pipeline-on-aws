/**
 * Pre-destroy script: Invokes POST /quicksight/teardown on the admin Lambda
 * to clean up the QuickSight VPC connection before stack deletion.
 *
 * This prevents orphaned ENIs from blocking subnet/VPC deletion.
 * The script is idempotent — safe to run even if QuickSight is not enabled.
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function getConfig() {
  return yaml.load(
    fs.readFileSync(path.resolve('./infrastructure/config.yaml'), 'utf8')
  );
}

const config = getConfig();

if (!config.ENABLE_QUICKSIGHT_DASHBOARD) {
  console.log('QuickSight not enabled — skipping teardown.');
  process.exit(0);
}

// Find the admin Lambda function name from CloudFormation outputs
const stackName = config.WORKLOAD_NAME || 'game-analytics-pipeline';
console.log(`Looking up admin Lambda for stack: ${stackName}...`);

let functionName;
try {
  const output = execSync(
    `aws cloudformation list-stack-resources --stack-name "${stackName}" --query "StackResourceSummaries[?starts_with(LogicalResourceId, 'LambdaConstructApplicationAdminServiceFunction')].PhysicalResourceId" --output text`,
    { encoding: 'utf8', timeout: 30000 }
  ).trim();
  functionName = output.split('\t')[0];
} catch (err) {
  console.error('Failed to find admin Lambda via CloudFormation. Is the stack deployed?');
  console.error(err.message);
  process.exit(0);
}

if (!functionName) {
  console.log('Admin Lambda not found — stack may already be deleted. Skipping teardown.');
  process.exit(0);
}

console.log(`Invoking POST /quicksight/teardown on ${functionName}...`);

const payload = JSON.stringify({
  httpMethod: 'POST',
  path: '/quicksight/teardown',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
  requestContext: { resourcePath: '/quicksight/teardown', httpMethod: 'POST' },
  isBase64Encoded: false,
});

try {
  const result = execSync(
    `aws lambda invoke --function-name "${functionName}" --payload '${payload}' /tmp/teardown-response.json`,
    { encoding: 'utf8', timeout: 360000 } // 6 min timeout (VPC connection deletion can take ~5 min)
  );
  console.log('Lambda invoke result:', result.trim());

  const response = JSON.parse(fs.readFileSync('/tmp/teardown-response.json', 'utf8'));
  const body = JSON.parse(response.body || '{}');

  if (response.statusCode === 200) {
    console.log('QuickSight teardown completed successfully.');
    console.log(JSON.stringify(body, null, 2));
  } else {
    console.warn(`Teardown returned status ${response.statusCode}:`, body);
    console.warn('Proceeding with destroy anyway — manual cleanup may be needed.');
  }
} catch (err) {
  console.warn('Teardown invocation failed:', err.message);
  console.warn('Proceeding with destroy anyway — manual cleanup may be needed.');
}
