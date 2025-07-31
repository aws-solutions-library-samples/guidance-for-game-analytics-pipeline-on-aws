# Configuration Reference

The following settings can be adjusted in `./infrastructure/config.yaml` for your use case

## Stack Options

`WORKLOAD_NAME`

- *Description:* The name of the workload that will deployed. This name will be used as a prefix for for any component deployed into your AWS Account.

- *Type:* String 

- *Example:* `"GameAnalyticsPipeline"`


## Data Platform Options

The following table shows unsupported configurations when options in this section are enabled

| Control | Setting | Exception |
| - | - | - |
| `INGEST_MODE` | `DIRECT_BATCH` | <ul><li>`DATA_PLATFORM_MODE` cannot be set to `REDSHIFT`</li><li>`REAL_TIME_ANALYTICS` cannot be set to `true`</li><li>Settings for `STREAM_PROVISIONED` and `STREAM_SHARD_COUNT` are ignored since no stream is deployed</li></ul> |
| `DATA_PLATFORM_MODE` | `REDSHIFT` | <ul><li>`ENABLE_APACHE_ICEBERG_SUPPORT` cannot be set to `true`</li></ul> |
| `REAL_TIME_ANALYTICS` | `true` | <ul><li>`INGEST_MODE` must be set to `KINESIS_DATA_STREAMS`</li></ul> |

`INGEST_MODE`

- *Description:* Controls the ingestion method for events recieved from the API. When set to `"KINESIS_DATA_STREAMS"` events are ingested into a real-time Kinesis Data Stream for live analytics. When set to `"DIRECT_BATCH"` events are ingested into an Amazon Data Firehose for near-real-time batch ingestion to a data lake.

- *Type:* String

- *Example:* `"KINESIS_DATA_STREAMS"`, `"DIRECT_BATCH"`

`REAL_TIME_ANALYTICS`

- *Description:* Whether or not to enable the [Real-Time](../component-deep-dive.md#3-real-time-optional) component/module of the guidance. It is recommended to set this value to `true` when first deploying this sample code for testing, as this setting will allow you to verify if streaming analytics is required for your use case. This setting can be changed at a later time, and the guidance re-deployed through CI/CD.

- *Type:* Boolean

- *Example:* `true`


`DATA_PLATFORM_MODE`

- *Description:* Controls the data platform that event data is saved to for analysis. When set to `"DATA_LAKE"`, raw events are saved to a data lake in S3 and cataloged using Glue Data Catalog. When set to `"REDSHIFT"` events are using the [streaming ingestion feature of Redshift](https://docs.aws.amazon.com/redshift/latest/dg/materialized-view-streaming-ingestion.html).


- *Type:* String

- *Example:* `"DATA_LAKE"`, `"REDSHIFT"`

- **Do not change this configuration after the stack is deployed**

`ENABLE_APACHE_ICEBERG_SUPPORT`

- *Description:* Whether or not to enable Apache Iceberg support in place of Apache Hive tables. When set to `true`, the raw events table will be configured as an Apache Iceberg table and the Firehose will be reconfigured to send data as Iceberg transactions. Enabling this option comes with [considerations for Firehose](https://docs.aws.amazon.com/firehose/latest/dev/apache-iceberg-considerations.html).

- *Type:* Boolean

- *Example:* `true`

- **Do not change this configuration after the stack is deployed. If you would like to enable Iceberg, we recommend deploying a new stack in parallel and migrating existing data.**

## Real-Time Analytics Options

These options are used for when `INGEST_MODE` is set to `KINESIS_DATA_STREAMS`

`STREAM_PROVISIONED`

- *Description:* The Kinesis stream capacity mode. When set to `true`, the stream will be created with the number of shards specified in `STREAM_SHARD_COUNT`. When set to `false`, the number of shards will be scaled automatically to handle throughput and the `STREAM_SHARD_COUNT` setting will be ignored. This value can be changed at a later time and re-deployed through CI/CD. For information about determining the capacity mode required for your use case, refer to [Choose the data stream capacity mode](https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html) in the *Amazon Kinesis Data Streams Developer Guide*.

`STREAM_SHARD_COUNT`

- *Description:* The number of Kinesis shards, or sequence of data records, to use for the data stream. The default value has been set to `1` for initial deployment, and testing purposes. This value can be changed at a later time, and the guidance re-deployed through CI/CD. For information about determining the shards required for your use case, refer to [Amazon Kinesis Data Streams Terminology and Concepts](https://docs.aws.amazon.com/streams/latest/dev/key-concepts.html) in the *Amazon Kinesis Data Streams Developer Guide*.

- *Type:* Integer

- *Example:* `1`


- *Type:* Boolean

- *Example:* `true`

## Data Storage Controls

`EVENTS_DATABASE`

- *Description:* The name of the of the [AWS Glue database](https://docs.aws.amazon.com/glue/latest/dg/tables-described.html) that contains the glue tables.

- *Type:* String (1-255 characters)

- *Example:* `"game_analytics"`

- *Limitations:* For compatibility with tools, the name should consist of lowercase letters, numbers, and underscores and start with a letter.

- **Do not change this configuration after the stack is deployed**

`RAW_EVENTS_TABLE`

- *Description:* The name of the of the [AWS Glue table](https://docs.aws.amazon.com/glue/latest/dg/tables-described.html) within which all new/raw data is cataloged.

- *Type:* String (1-255 characters)

- *Example:* `"raw_events"`

- *Limitations:* For compatibility with tools, the name should consist of lowercase letters, numbers, and underscores and start with a letter.

- **Do not change this configuration after the stack is deployed**

`RAW_EVENTS_PREFIX`

- *Description:* The prefix for new/raw data files stored in S3.

- *Type:* String

- *Example:* `"raw_events"`

- **Do not change this configuration after the stack is deployed**


`PROCESSED_EVENTS_PREFIX`

- *Description:* The prefix processed data files stored in S3.

- *Type:* String

- *Example:* `"processed_events"`

- **Do not change this configuration after the stack is deployed**

`GLUE_TMP_PREFIX`

- *Description:* The name of the temporary data store for AWS Glue.

- *Type:* String

- *Example:* `"glueetl-tmp"`

## Development Options

`API_STAGE_NAME`

- *Description:* The name of the REST API [stage](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-stages.html) for the [Amazon API Gateway](https://aws.amazon.com/api-gateway/) configuration endpoint for sending telemetry data to the pipeline. This provides an integration option for applications that cannot integrate with Amazon Kinesis directly. The API also provides configuration endpoints for admins to use for registering their game applications with the guidance, and generating API keys for developers to use when sending events to the REST API. The default value is set to `live`.

- *Type:* String

- *Example:* `"live"`

`DEV_MODE`

- *Description:* Whether or not to enable developer mode. This mode will ensure synthetic data, and shorter retention times are enabled. It is recommended that you set the value to `true` when first deploying the sample code for testing, as this setting will enable S3 versioning, and won't delete S3 buckets on teardown. This setting can be changed at a later time, and the infrastructure re-deployed through CI/CD.

- *Type:* Boolean

- *Example:* `true`

`S3_BACKUP_MODE`

- *Description:* Whether or not to enable [Kinesis Data Firehose](https://aws.amazon.com/kinesis/data-firehose/) to send a backup of new/raw data to S3. The default value has been set to `false` for initial deployment, and testing purposes. This value can be changed at a later time, and the guidance re-deployed through CI/CD. 

- *Type:* Boolean

- *Example:* `false`

## Monitoring Options

`EMAIL_ADDRESS`

- *Description:* The email address to receive operational notifications, and delivered by CloudWatch.

- *Type:* String

- *Example:* `"user@example.com"`

`CLOUDWATCH_RETENTION_DAYS`

- *Description:* The default number of days in which [Amazon CloudWatch](https://aws.amazon.com/cloudwatch/) stores all the logs. The default value has been set to `30` for initial deployment, and testing purposes. This value can be changed at a later time, and the guidance re-deployed through CI/CD. 

- *Type:* Integer

- *Example:* `30`

## Version Options

`CDK_VERSION`

- *Description:* The version of the CDK installed in your environment. To see the current version of the CDK, run the `cdk --version` command. The guidance has been tested using CDK version `2.92.0` of the CDK. If you are using a different version of the CDK, ensure that this version is also reflected in the `./infrastructure/package.json` file.

- *Type:* String

- *Example:* `"2.92.0"`


`NODE_VERSION`

- *Description:* The version of NodeJS being used. The default value is set to `"latest"`, and should only be changed this if you require a specific version.

- *Type:* String

- *Example:* `"latest"`


`PYTHON_VESION`

- *Description:* The version of Python being used. The default value is set to `"3.8"`, and should only be changed if you require a specific version.

- *Type:* String

- *Example:* `"3.8"`