const {
  RedshiftDataClient,
  ExecuteStatementCommand,
  DescribeStatementCommand,
} = require('@aws-sdk/client-redshift-data');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const DATA_STACK = process.env.DATA_STACK;
const SECRET_ARN = process.env.SECRET_ARN;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;
const DATABASE_NAME = process.env.DATABASE_NAME;
const REDSHIFT_ROLE_ARN = process.env.REDSHIFT_ROLE_ARN;
const STREAM_NAME = process.env.STREAM_NAME;
const MATERIALIZED_VIEW_NAME = 'event_data';

const create_schema_statement = `CREATE EXTERNAL SCHEMA IF NOT EXISTS kds FROM KINESIS IAM_ROLE '${REDSHIFT_ROLE_ARN}';`;

const create_materialized_view_statement = `CREATE MATERIALIZED VIEW ${MATERIALIZED_VIEW_NAME} AUTO REFRESH YES AS SELECT
      refresh_time,
      approximate_arrival_timestamp,
      partition_key,
      shard_id,
      sequence_number,
      json_parse(kinesis_data) AS payload,
      payload.event.event_id::TEXT AS event_id,
      payload.event.event_type::TEXT AS event_type,
      payload.event.event_name::TEXT AS event_name,
      payload.event.event_version::TEXT AS event_version,
      payload.event.event_timestamp::BIGINT AS event_timestamp,
      payload.event.app_version::TEXT AS app_version,
      payload.application_id::TEXT AS application_id,
      payload.event.application_name::TEXT AS application_name,
      payload.event.event_data AS event_data,
      payload.event.metadata AS metadata
  FROM kds."${STREAM_NAME}"
  WHERE CAN_JSON_PARSE(kinesis_data);`;

// When executing create_materialized_view_statement, do not consider the following an error
// All other statements support CREATE OR REPLACE, or IF NOT EXISTS
// This allows the setup redshift endpoint to be called multiple times without harm
const mv_ignore_errors = [`ERROR: relation \"${MATERIALIZED_VIEW_NAME}\" already exists`];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setupRedshift() {
  if (DATA_STACK !== 'REDSHIFT') {
    return Promise.reject({
      code: 400,
      error: 'BadRequest',
      message: `Redshift is not deployed and can not be configured.`,
    });
  }

  const config = {};
  const client = new RedshiftDataClient(config);

  try {
    console.log(`Executing: ${create_schema_statement}`);
    const client_id = await executeStatement(client, create_schema_statement);
    await waitForStatement(client, client_id);
    console.log(`Executed: ${create_schema_statement}`);

    console.log(`Executing: ${create_materialized_view_statement}`);
    const materialized_view_id = await executeStatement(client, create_materialized_view_statement);
    await waitForStatement(client, materialized_view_id, mv_ignore_errors);
    console.log(`Executed: ${create_materialized_view_statement}`);
  } catch (error) {
    console.log('Error setupRedshift A');
    console.log(JSON.stringify(error));
    return Promise.reject(error);
  }

  try {
    console.log('Setting up redshift views');
    const directoryPath = path.join(__dirname, 'sql/views');
    const filenames = fs.readdirSync(directoryPath);
    console.log(filenames);

    // The views only depend on the materialized view (created above), not on each
    // other, so create them concurrently. Running them sequentially exceeds the
    // API Gateway 29s integration timeout; parallelizing keeps the endpoint synchronous.
    await Promise.all(
      filenames.map(async (filename) => {
        const statement = fs
          .readFileSync(`${directoryPath}/${filename}`, 'utf8')
          .replaceAll('{db_name}', DATABASE_NAME)
          .replaceAll('{stream_name}', STREAM_NAME);
        console.log(`Creating view: ${filename}`);
        const id = await executeStatement(client, statement);
        // Materialized views don't support CREATE OR REPLACE, so ignore "already exists" errors
        const viewName = filename.replace('.sql', '');
        const ignore = [`ERROR: relation "${viewName}" already exists`];
        await waitForStatement(client, id, ignore);
        console.log(`Created view: ${filename}`);
      })
    );
    console.log('Redshift views created');
  } catch (error) {
    console.log('Error setupRedshift B');
    console.log(JSON.stringify(error));
    return Promise.reject(error);
  }

  return Promise.resolve({ Result: 'OK' });
}

const waitForStatement = async (client, id, ignore_errors = [], retries = 80) => {
  for (let i = 0; i < retries; i++) {
    const describeStatement = { Id: id };
    const result = await client.send(new DescribeStatementCommand(describeStatement));
    if (result.Status == 'FAILED') {
      if (ignore_errors.includes(result.Error)) {
        console.log('Ignoring error: ' + result.Error);
        return;
      }
      console.log('Error waitForStatement');
      console.log(JSON.stringify(result));
      throw new Error(result.Error);
    } else if (result.Status == 'FINISHED') {
      return;
    }
    await sleep(250);
  }
  throw new Error('Failed to get statement status, took too long.');
};

const executeStatement = async (client, statement) => {
  try {
    const input = {
      Sql: statement,
      SecretArn: SECRET_ARN,
      Database: DATABASE_NAME,
      WithEvent: true,
      WorkgroupName: WORKGROUP_NAME,
      ClientToken: uuidv4(),
    };
    const command = new ExecuteStatementCommand(input);
    const response = await client.send(command);
    return response.Id;
  } catch (error) {
    console.log('Error executeStatement');
    console.log(JSON.stringify(error));
    throw error;
  }
};

module.exports = {
  setupRedshift,
};
