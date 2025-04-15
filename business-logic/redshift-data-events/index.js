const {
  RedshiftDataClient,
  DescribeStatementCommand
} = require("@aws-sdk/client-redshift-data");
const { MetricUnit, Metrics } = require("@aws-lambda-powertools/metrics");
const { Logger } = require("@aws-lambda-powertools/logger");

const logger = new Logger();
const metrics = new Metrics();
const config = {};
const client = new RedshiftDataClient(config);

exports.handler = async (event, context) => {
  const detail = event.detail;
  if (detail.state === "FINISHED") {
    metrics.addMetric("RecordsIngested", MetricUnit.Count, detail.rows);
  } else if (detail.state === "FAILED") {
    await storeFailedStatement(detail.statementId);
    metrics.addMetric("FailedBatches", MetricUnit.Count, 1);
  }
  metrics.publishStoredMetrics();
};

const storeFailedStatement = async (id) => {
  const describeStatement = { Id: id };
  const result = await client.send(
    new DescribeStatementCommand(describeStatement)
  );
  logger.error("Failed Statement", { result });
};
