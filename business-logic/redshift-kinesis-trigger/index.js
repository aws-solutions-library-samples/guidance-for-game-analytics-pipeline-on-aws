const {
  RedshiftDataClient,
  ExecuteStatementCommand,
  DescribeStatementCommand,
} = require("@aws-sdk/client-redshift-data");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const config = {};
const client = new RedshiftDataClient(config);

const INGEST_MODE = process.env.INGEST_MODE;
const SECRET_ARN = process.env.SECRET_ARN;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;
const DATABASE_NAME = process.env.DATABASE_NAME;
const REDSHIFT_ROLE_ARN = process.env.REDSHIFT_ROLE_ARN;
const STREAM_NAME = process.env.STREAM_NAME;

const real_time_setup_statements = [
  `CREATE EXTERNAL SCHEMA IF NOT EXISTS kds FROM KINESIS IAM_ROLE '${REDSHIFT_ROLE_ARN}';`,
  `CREATE OR REPLACE MATERIALIZED VIEW event_data AUTO REFRESH YES AS SELECT 
      refresh_time,
      approximate_arrival_timestamp,
      partition_key,
      shard_id,
      sequence_number,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_id',true)::TEXT as event_id,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_type',true)::TEXT as event_type,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_name',true)::TEXT as event_name,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_version',true)::TEXT as event_version,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_timestamp',true)::BIGINT as event_timestamp,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','app_version',true)::TEXT as app_version,
      json_extract_path_text(from_varbyte(kinesis_data, 'utf-8'),'application_id',true)::TEXT as application_id,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','application_name',true)::TEXT as application_name,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_data',true)::TEXT as event_data,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','metadata',true)::TEXT as metadata 
  FROM kds."${STREAM_NAME}";`,
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.handler = async (event, context, callback) => {
  if (INGEST_MODE == "REAL_TIME_KDS") {
    for (const statement of real_time_setup_statements) {
      const id = await executeStatement(statement);
      await waitForStatement(id);
    }
  } else if (INGEST_MODE == "DIRECT_BATCH") {
    const statement = fs.readFileSync(
      `${__dirname}/direct_batch_setup.sql`,
      "utf8"
    );
    const id = await executeStatement(statement);
    await waitForStatement(id);
  }

  const directoryPath = path.join(__dirname, "views");
  filenames = fs.readdirSync(directoryPath);

  for (const filename of filenames) {
    const statement = fs.readFileSync(`${directoryPath}/${filename}`, "utf8");
    const id = await executeStatement(statement);
    await waitForStatement(id);
  }
};

const waitForStatement = async (id, retries = 0) => {
  if (retries > 20) {
    throw new Error("Failed to get statement status, took too long.");
  }

  const describeStatement = { Id: id };
  const result = await client.send(
    new DescribeStatementCommand(describeStatement)
  );
  if (result.Status == "FAILED") {
    throw new Error(result.Error);    
  } else if (result.Status == "FINISHED") {
    return;
  }
  await sleep(200);
  await waitForStatement(id, retries + 1);
};

const executeStatement = async (statement) => {
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
};
