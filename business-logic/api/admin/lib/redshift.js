const {
  RedshiftDataClient,
  ExecuteStatementCommand,
  DescribeStatementCommand,
} = require("@aws-sdk/client-redshift-data");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

const DATA_PLATFORM_MODE = process.env.DATA_PLATFORM_MODE;
const SECRET_ARN = process.env.SECRET_ARN;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;
const DATABASE_NAME = process.env.DATABASE_NAME;
const REDSHIFT_ROLE_ARN = process.env.REDSHIFT_ROLE_ARN;
const STREAM_NAME = process.env.STREAM_NAME;
const MATERIALIZED_VIEW_NAME = "event_data";

const create_schema_statement = `CREATE EXTERNAL SCHEMA IF NOT EXISTS kds FROM KINESIS IAM_ROLE '${REDSHIFT_ROLE_ARN}';`;
const create_materialized_view_statement = `CREATE MATERIALIZED VIEW ${MATERIALIZED_VIEW_NAME} AUTO REFRESH YES AS SELECT 
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
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'application_id',true)::TEXT as application_id,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','application_name',true)::TEXT as application_name,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_data',true)::TEXT as event_data,
      json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','metadata',true)::TEXT as metadata 
  FROM kds."${STREAM_NAME}";`;

// When executing create_materialized_view_statement, do not consider the following an error
// All other statements support CREATE OR REPLACE, or IF NOT EXISTS
// This allows the setup redshift endpoint to be called multiple times without harm
const mv_ignore_errors = [
  `ERROR: relation \"${MATERIALIZED_VIEW_NAME}\" already exists`,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setupRedshift() {
  if (DATA_PLATFORM_MODE !== "REDSHIFT") {
    return Promise.reject({
      code: 400,
      error: "BadRequest",
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
    const materialized_view_id = await executeStatement(
      client,
      create_materialized_view_statement
    );
    await waitForStatement(client, materialized_view_id, mv_ignore_errors);
    console.log(`Executed: ${create_materialized_view_statement}`);
  } catch (error) {
    console.log("Error setupRedshift A");
    console.log(JSON.stringify(error));
    return Promise.reject(error);
  }

  try {
    console.log("Setting up redshift views");
    const directoryPath = path.join(__dirname, "sql/views");
    filenames = fs.readdirSync(directoryPath);
    console.log(filenames);

    for (const filename of filenames) {
      const statement = fs.readFileSync(`${directoryPath}/${filename}`, "utf8");
      console.log(`Creating view: ${filename}`);
      const id = await executeStatement(client, statement);
      await waitForStatement(client, id);
      console.log(`Created view: ${filename}`);
    }
    console.log("Redshift views created");
  } catch (error) {
    console.log("Error setupRedshift B");
    console.log(JSON.stringify(error));
    return Promise.reject(error);
  }

  return Promise.resolve({ Result: "OK" });
}

const waitForStatement = async (
  client,
  id,
  ignore_errors = [],
  retries = 20
) => {
  for (let i = 0; i < retries; i++) {
    const describeStatement = { Id: id };
    const result = await client.send(
      new DescribeStatementCommand(describeStatement)
    );
    if (result.Status == "FAILED") {
      if (ignore_errors.includes(result.Error)) {
        console.log("Ignoring error: " + result.Error);
        return;
      }
      console.log("Error waitForStatement");
      console.log(JSON.stringify(result));
      throw new Error(result.Error);
    } else if (result.Status == "FINISHED") {
      return;
    }
    await sleep(500);
  }
  throw new Error("Failed to get statement status, took too long.");
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
    console.log("Error executeStatement");
    console.log(JSON.stringify(error));
    throw error;
  }
};

module.exports = {
  setupRedshift,
};
