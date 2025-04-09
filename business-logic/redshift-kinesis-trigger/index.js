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

const SECRET_ARN = process.env.SECRET_ARN;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;
const DATABASE_NAME = process.env.DATABASE_NAME;
const REDSHIFT_ROLE_ARN = process.env.REDSHIFT_ROLE_ARN;
const STREAM_NAME = process.env.STREAM_NAME;

const statements = [
  `CREATE EXTERNAL SCHEMA kds FROM KINESIS IAM_ROLE '${REDSHIFT_ROLE_ARN}';`,
  `CREATE MATERIALIZED VIEW event_data AUTO REFRESH YES AS SELECT * FROM kds."${STREAM_NAME}";`,
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.handler = async (event, context, callback) => {
  for (const statement of statements) {
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
  const describeStatement = { Id: response.Id };
  const result = await client.send(
    new DescribeStatementCommand(describeStatement)
  );
  return response.Id;
};
