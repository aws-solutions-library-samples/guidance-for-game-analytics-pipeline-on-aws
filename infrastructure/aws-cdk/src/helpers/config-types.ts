export interface GameAnalyticsPipelineConfig {
  REGION: string;
  WORKLOAD_NAME: string;
  DEV_MODE: boolean;

  INGEST_MODE: "DIRECT_BATCH" | "REAL_TIME_KDS";
  DATA_PLATFORM_MODE: "DATA_LAKE" | "REDSHIFT";
  ENABLE_APACHE_ICEBERG_SUPPORT: boolean;

  EVENTS_DATABASE: string;
  RAW_EVENTS_TABLE: string;
  RAW_EVENTS_PREFIX: string;
  PROCESSED_EVENTS_PREFIX: string;

  STREAM_PROVISIONED: boolean;
  STREAM_SHARD_COUNT: number;
  CLOUDWATCH_RETENTION_DAYS: number;
  API_STAGE_NAME: string;
  EMAIL_ADDRESS: string;

  GLUE_TMP_PREFIX: string; // might be able to be removed
  S3_BACKUP_MODE: boolean; // might be inherited by DEV_MODE
}
