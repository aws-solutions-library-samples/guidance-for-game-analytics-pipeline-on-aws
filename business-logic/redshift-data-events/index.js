const { Logger } = require("@aws-lambda-powertools/logger");

const logger = new Logger();
const metrics = new Metrics();

exports.handler = async (event, context) => {
  const detail = event.detail;
  if (detail.state === "FINISHED") {
    metrics.addMetric("RecordsWritten", MetricUnit.Count, detail.rows);
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
