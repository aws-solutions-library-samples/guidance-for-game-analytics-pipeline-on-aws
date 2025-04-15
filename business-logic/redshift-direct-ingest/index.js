const {
  RedshiftDataClient,
  ExecuteStatementCommand,
  DescribeStatementCommand,
} = require("@aws-sdk/client-redshift-data");
const { v4: uuidv4 } = require("uuid");

const { MetricUnit, Metrics } = require("@aws-lambda-powertools/metrics");
const { Logger } = require("@aws-lambda-powertools/logger");
const {
  BatchProcessor,
  EventType,
  processPartialResponse,
} = require("@aws-lambda-powertools/batch");

const metrics = new Metrics();
const logger = new Logger();
const processor = new BatchProcessor(EventType.SQS);

const config = {};
const client = new RedshiftDataClient(config);

const SECRET_ARN = process.env.SECRET_ARN;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;
const DATABASE_NAME = process.env.DATABASE_NAME;

const statementPrefix =
  "INSERT INTO event_data (event_id, event_type, event_name, event_version, event_timestamp, app_version, application_id, event_data) VALUES";

const recordHandler = async (record) => {
  logger.info("Processing record", record);
  const payload = record.body;
  if (payload) {
    const item = JSON.parse(payload);
    const application_id = item.applicationId;
    const events = item.body.events;
    try {
      let values = events
        .map(
          (e) =>
            `('${e.event_id}','${e.event_type}','${e.event_name}','${
              e.event_version
            }','${e.event_timestamp}','${
              e.app_version
            }','${application_id}','${JSON.stringify(e.event_data)}')`
        )
        .join(", ");
      const statement = `${statementPrefix} ${values};`;
      const id = await executeStatement(statement);
      logger.info(`Executed statement for ${events.length} events`);
      metrics.addMetric("RecordsReceived", MetricUnit.Count, events.length);
      metrics.publishStoredMetrics();
    } catch (error) {
      logger.info("Failed to ingest events", { error });
      throw error;
    }
  }
};

exports.handler = async (event, context) => {
  await processPartialResponse(event, recordHandler, processor, {
    context,
  });
};

const executeStatement = async (statement) => {
  try {
    const input = {
      Sql: statement,
      StatementName: "BatchIngest",
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
    logger.error("Failed to execute statement", { error });
    throw error;
  }
};
