export interface GameAnalyticsPipelineConfig {
  KinesisStreamShards: number;
  DEV_MODE: boolean;
  EnableStreamingAnalytics: boolean;
  SolutionAdminEmailAddress: string;
  // Default Configuration Settings
  DEMO: string;
  WORKLOAD_NAME: string;
  CDK_VERSION: string;
  NODE_VERSION: string;
  PYTHON_VERSION: string;
  EMAIL_ADDRESS: string;
  API_STAGE_NAME: string;
  RAW_EVENTS_PREFIX: string;
  PROCESSED_EVENTS_PREFIX: string;
  RAW_EVENTS_TABLE: string;
  GLUE_TMP_PREFIX: string;
  STREAM_SHARD_COUNT: number;
  METRIC_STREAM_SHARD_COUNT: number;
  STREAM_PROVISIONED: boolean;
  ENABLE_STREAMING_ANALYTICS: boolean;
  ENABLE_APACHE_ICEBERG_SUPPORT: boolean;
  S3_BACKUP_MODE: boolean;
  CLOUDWATCH_RETENTION_DAYS: number;
  REGION: string;
}
