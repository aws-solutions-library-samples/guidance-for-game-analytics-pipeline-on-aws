const {
  RedshiftDataClient,
  ExecuteStatementCommand,
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
  `CREATE MATERIALIZED VIEW kds_view AUTO REFRESH YES AS SELECT * FROM 'kds.${STREAM_NAME}';`,
];

exports.handler = async (event, context, callback) => {
  for (const statement of statements) {
    await executeStatement(statement);
  }

  const directoryPath = path.join(__dirname, "views");
  filenames = fs.readdirSync(directoryPath);

  for (const filename of filenames) {
    const statement = fs.readFileSync(`${directoryPath}/${filename}`, "utf8");
    await executeStatement(statement);
  }
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
  console.log(statement);
  console.log(JSON.stringify(response));
};
