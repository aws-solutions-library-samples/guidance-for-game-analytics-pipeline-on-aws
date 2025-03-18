export interface GameAnalyticsPipelineConfig {
  WORKLOAD_NAME: string;
  DEV_MODE: boolean;
  STREAMING_MODE: "BATCH_FIREHOSE" | "REAL_TIME_KDS" | "REAL_TIME_MSK"; // BATCH_FIREHOSE = direct PUT on the Firehose, REAL_TIME_KDS and REAL_TIME_MSK disable direct PUT in firehose
  ENABLE_APACHE_ICEBERG_SUPPORT: boolean;
  STREAM_PROVISIONED: boolean;
  STREAM_SHARD_COUNT: number;
  METRIC_STREAM_SHARD_COUNT: number; // need to evaluate if this is needed
  RAW_EVENTS_PREFIX: string;
  PROCESSED_EVENTS_PREFIX: string;
  EVENTS_DATABASE: string;
  RAW_EVENTS_TABLE: string;
  GLUE_TMP_PREFIX: string;
  S3_BACKUP_MODE: boolean;
  CLOUDWATCH_RETENTION_DAYS: number;
  API_STAGE_NAME: string;
  EMAIL_ADDRESS: string;
  REGION: string;
}
