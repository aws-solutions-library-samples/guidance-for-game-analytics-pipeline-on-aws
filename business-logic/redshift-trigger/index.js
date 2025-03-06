const {
  RedshiftDataClient,
  ExecuteStatementCommand,
} = require("@aws-sdk/client-redshift-data");

const config = {};
const client = new RedshiftDataClient(config);

const SECRET_ARN = process.env.SECRET_ARN;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;
const DATABASE_NAME = process.env.DATABASE_NAME;
const REDSHIFT_ROLE_ARN = process.env.REDSHIFT_ROLE_ARN;
const STREAM_NAME = process.env.STREAM_NAME;

const statements = [
  `CREATE EXTERNAL SCHEMA kds FROM KINESIS IAM_ROLE '${REDSHIFT_ROLE_ARN}';`,  
  ```
  CREATE MATERIALIZED VIEW event_data DISTKEY(6) sortkey(1) AUTO REFRESH YES AS
  SELECT refresh_time,
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
  FROM "kds"."${STREAM_NAME}"
  WHERE LENGTH(kinesis_data) < 65355;
  ```
];

exports.handler = async (event, context, callback) => {
  for (const statement of statements) {
    const input = {
      // ExecuteStatementInput
      Sql: statement, // required
      SecretArn: SECRET_ARN,
      Database: DATABASE_NAME,
      WithEvent: true,
      // StatementName: "STRING_VALUE",
      // Parameters: [
      //   // SqlParametersList
      //   {
      //     // SqlParameter
      //     name: "STRING_VALUE", // required
      //     value: "STRING_VALUE", // required
      //   },
      // ],
      WorkgroupName: WORKGROUP_NAME,
      ClientToken: context.awsRequestId,
      // SessionKeepAliveSeconds: Number("int"),
      // SessionId: "STRING_VALUE",
      // ResultFormat: "STRING_VALUE",
    };
    const command = new ExecuteStatementCommand(input);
    const response = await client.send(command);
    console.log(statement);
    console.log(JSON.stringify(response));
  }
};
