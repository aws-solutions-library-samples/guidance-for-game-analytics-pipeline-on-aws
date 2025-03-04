import {
  RedshiftDataClient,
  ExecuteStatementCommand,
  RedshiftDataClientConfig,
  ExecuteStatementCommandInput,
} from "@aws-sdk/client-redshift-data";
import { Context } from "aws-lambda";

const config: RedshiftDataClientConfig = {};
const client = new RedshiftDataClient(config);

const SECRET_ARN = process.env.SECRET_ARN;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;
const DATABASE_NAME = process.env.DATABASE_NAME;
const REDSHIFT_ROLE_ARN = process.env.REDSHIFT_ROLE_ARN;
const STREAM_NAME = process.env.STREAM_NAME;

const statements = [
  `CREATE EXTERNAL SCHEMA kds FROM KINESIS IAM_ROLE { default | '${REDSHIFT_ROLE_ARN}' };`,
  `CREATE MATERIALIZED VIEW kds_view AUTO REFRESH YES AS SELECT * FROM kds.${STREAM_NAME};`,
];

exports.handler = async (event, context: Context, callback) => {
  const input: ExecuteStatementCommandInput = {
    // ExecuteStatementInput
    Sql: "STRING_VALUE", // required
    SecretArn: SECRET_ARN,
    Database: DATABASE_NAME,
    WithEvent: true,
    // StatementName: "STRING_VALUE",
    Parameters: [
      // SqlParametersList
      {
        // SqlParameter
        name: "STRING_VALUE", // required
        value: "STRING_VALUE", // required
      },
    ],
    WorkgroupName: WORKGROUP_NAME,
    ClientToken: context.awsRequestId,
    // SessionKeepAliveSeconds: Number("int"),
    // SessionId: "STRING_VALUE",
    // ResultFormat: "STRING_VALUE",
  };
  const command = new ExecuteStatementCommand(input);
  const response = await client.send(command);
  console.log(JSON.stringify(response));
};
