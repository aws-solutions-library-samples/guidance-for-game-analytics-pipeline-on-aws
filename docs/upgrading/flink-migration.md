# Upgrading from Kinesis Data Analytics to Managed Apache Flink

Amazon Kinesis Data Analytics for SQL applications, which is used in the original architecture of the Game Analytics Pipeline on AWS, is being discontinued. You can learn more about the discontinuation using the following resources.

- [Amazon Kinesis Data Analytics for SQL Applications discontinuation](https://docs.aws.amazon.com/kinesisanalytics/latest/dev/discontinuation.html)

Amazon Managed Service for Apache Flink is a serverless, low-latency, highly scalable, and highly available real-time stream processing service. Amazon Managed Service for Apache Flink replaces Amazon Kinesis Data Analytics for SQL Applications in the Game Analytics Pipeline on AWS architecture.

Amazon Web Services has published a guide and examples to assist with the migration to Flink. The resources are accessible using the links below.

- [Migrate from Amazon Kinesis Data Analytics for SQL to Amazon Managed Service for Apache Flink and Amazon Managed Service for Apache Flink Studio](https://aws.amazon.com/blogs/big-data/migrate-from-amazon-kinesis-data-analytics-for-sql-to-amazon-managed-service-for-apache-flink-and-amazon-managed-service-for-apache-flink-studio/)
- [Migrating to Managed Service for Apache Flink Studio Examples](https://docs.aws.amazon.com/kinesisanalytics/latest/dev/migrating-to-kda-studio-overview.html)

This page discusses differences in development and deployment specific to the stream processing utilized for the Game Analytics Pipeline on AWS.

## Table Definition

### Source Table

#### Kinesis Data Analytics Definition
In Kinesis Data Analytics, the input stream is defined using a `kinesisanalytics.CfnApplication.InputSchemaProperty` CDK construct

```js
const inputSchema: kinesisanalytics.CfnApplication.InputSchemaProperty = {
  recordColumns: [
    {
      name: "event_version",
      sqlType: "VARCHAR(8)",
      mapping: "$.event.event_version",
    },
    {
      name: "event_id",
      sqlType: "VARCHAR(64)",
      mapping: "$.event.event_id",
    },
    {
      name: "event_timestamp",
      sqlType: "BIGINT",
      mapping: "$.event.event_timestamp",
    },
    {
      name: "event_type",
      sqlType: "VARCHAR(64)",
      mapping: "$.event.event_type",
    },
    {
      name: "app_version",
      sqlType: "VARCHAR(8)",
      mapping: "$.event.app_version",
    },
    {
      name: "level_id",
      sqlType: "VARCHAR(64)",
      mapping: "$.event.event_data.level_id",
    },
    {
      name: "country_id",
      sqlType: "VARCHAR(64)",
      mapping: "$.event.event_data.country_id",
    },
    {
      name: "spell_id",
      sqlType: "VARCHAR(64)",
      mapping: "$.event.event_data_spell_id",
    },
    {
      name: "application_id",
      sqlType: "VARCHAR(64)",
      mapping: "$.application_id",
    },
    {
      name: "last_login_time",
      sqlType: "BIGINT",
      mapping: "$.event.event_data.last_login_time",
    },
    {
      name: "currency_type",
      sqlType: "VARCHAR(64)",
      mapping: "$.event.event_data.currency_type",
    },
    {
      name: "currency_amount",
      sqlType: "DOUBLE",
      mapping: "$.event.event_data.currency_amount",
    },
  ],
  recordFormat: {
    recordFormatType: "JSON",
    mappingParameters: {
      jsonMappingParameters: {
        recordRowPath: "$",
      },
    },
  },
};
```

#### Flink Definition

In Flink, the input table is defined using a [CREATE TABLE command](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/sql/create/) within the application code itself.

The definition utilizes the [Amazon Kinesis Data Streams SQL Connector](https://nightlies.apache.org/flink/flink-docs-release-1.20/docs/connectors/table/kinesis/) version `5.0.0-1.20`. The version contains changes changes to the connector options compared to previous versions.

The following data definition statement defines the schema used in the application code.

```sql
CREATE TABLE input_table (
    event ROW(
        `event_version` VARCHAR,
        `event_id` VARCHAR,
        `event_type` VARCHAR,
        `event_name` VARCHAR,
        `event_timestamp` BIGINT,
        `app_version` VARCHAR,
        `event_data` STRING
    ),
    application_id STRING,
    rowtime AS TO_TIMESTAMP_LTZ(event.event_timestamp, 0),
    WATERMARK FOR rowtime AS rowtime - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kinesis',
    'stream.arn' = '<stream_arn>',
    'aws.region' = '<stream_region>',
    'source.init.position' = '<stream_position>',
    'format' = 'json',
    'json.timestamp-format.standard' = 'ISO-8601'
);
```
- `<stream_arn>` is replaced with the ARN of the Kinesis stream to be read from
- `<stream_region>` is replaced with the AWS region of the Kinesis stream
- `<stream_position>` is replaced with the initial position of the Kinesis stream

In a deployed Managed Flink application, the variables are loaded from the application's configured [runtime properties](https://docs.aws.amazon.com/managed-flink/latest/java/how-properties.html).

##### Modifications

- Since data is nested in the `event` JSON attribute of the message, the Flink [`ROW` data type](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/types/#constructured-data-types) is utilized to define known attributes and make them accessible using a dot notation. 
    - This is done for the attributes `event_version`, `event_id`, `event_type`, `event_name`, `event_timestamp`, and `event_data`.
- `event_data` contains a nested JSON object, of which has a user-defined schema that varies depending on the event. Since the schema changes dpeending on the event type, it is extracted as a [`STRING` data type](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/types/#character-strings). 
    - To retrieve values nested in the object, the [`JSON_VALUE` function](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/functions/systemfunctions/#json-functions) is used within aggregation queries.
- `rowtime` is retrieved explicitly from `event.event_timestamp` object and converted into a [`TIMESTAMP_LTZ` data type](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/types/#date-and-time) attribute. This makes the event time accessible for use in windowing functions.
    - `rowtime` is used for [watermarking](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/#event-time-and-watermarks) within Flink. 
    - The `WATERMARK FOR` statement declares `rowtime` for use with the watermarking strategy. The formula `rowtime - INTERVAL '5' SECOND` is a delayed 5-seconds watermark strategy which is an upper-bound for out-of-orderness. It allows events to arrive up to 5 seconds late.


### Sink Table

#### Kinesis Data Analytics Definition
In Kinesis Data Analytics, the sink is defined as a STREAM in the SQL code of the application.

```sql
CREATE STREAM "DESTINATION_STREAM"(
METRIC_NAME VARCHAR(1024),
METRIC_TIMESTAMP BIGINT,
METRIC_UNIT_VALUE_INT BIGINT,
METRIC_UNIT VARCHAR(1024),
DIMENSION_APPLICATION_ID VARCHAR(1024),
DIMENSION_APP_VERSION VARCHAR(1024),
DIMENSION_COUNTRY_ID VARCHAR(1024),
DIMENSION_CURRENCY_TYPE VARCHAR (1024),
DIMENSION_SPELL_ID VARCHAR (1024),
DIMENSION_MISSION_ID VARCHAR (1024),
DIMENSION_ITEM_ID VARCHAR (1024),
OUTPUT_TYPE VARCHAR(1024));
```

#### Flink Definition
In Flink, the output table is defined using a [CREATE TABLE command](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/sql/create/) within the application code.

Like the [Source Table](#source-table), the definition utilizes the [Amazon Kinesis Data Streams SQL Connector](https://nightlies.apache.org/flink/flink-docs-release-1.20/docs/connectors/table/kinesis/) version `5.0.0-1.20`.

```sql
CREATE TABLE output_table (
    METRIC_NAME STRING,
    METRIC_TIMESTAMP TIMESTAMP_LTZ(3),
    METRIC_UNIT_VALUE_INT BIGINT,
    METRIC_UNIT STRING,
    DIMENSION_APPLICATION_ID STRING,
    DIMENSION_APP_VERSION STRING,
    DIMENSION_COUNTRY_ID STRING,
    DIMENSION_CURRENCY_TYPE STRING,
    DIMENSION_SPELL_ID STRING,
    DIMENSION_MISSION_ID STRING,
    DIMENSION_ITEM_ID STRING,
    OUTPUT_TYPE STRING,
    WATERMARK FOR METRIC_TIMESTAMP AS METRIC_TIMESTAMP - INTERVAL '5' SECOND
)
PARTITIONED BY (METRIC_NAME)
WITH (
    'connector' = 'kinesis',
    'stream.arn' = '<stream_arn>',
    'aws.region' = '<stream_region>',
    'sink.partitioner-field-delimiter' = ';',
    'sink.batch.max-size' = '100',
    'format' = 'json',
    'json.timestamp-format.standard' = 'ISO-8601'
);
```
- `<stream_arn>` is replaced with the ARN of the Kinesis stream to write to
- `<stream_region>` is replaced with the AWS region of the Kinesis stream

##### Modifications
- Unlike the stream definition in Kinesis Data Analytics, the sink has to specify a connector as an output. 
    - A separate Kinesis stream is used as an output sink and is an intermediary between Flink and the metric consumer. This is discussed further in the [Metric Output Stream](#metric-output-stream) section.
- The output schema is kept the same as the Kinesis Data Analytics to minimize modifications to downstream code.

## Stream Processing Queries

The logic behind writing a stream processing query is similar between Flink SQL and Kinesis Data Analytics. The data movement is written as an `INSERT` into the sink using a `SELECT` from the source. 

Some key differences in the schema between Flink SQL and Kinesis Data Analytics are windowing functions, deduplication, and the use of `JSON_VALUE` functions to extract nested data.

### Total Events
Count of Total Events within period
#### Kinesis Data Analytics Definition

```sql
CREATE OR REPLACE PUMP "TOTAL_EVENTS_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT STREAM 'TotalEvents', UNIX_TIMESTAMP(TIME_WINDOW), COUNT(distinct_stream.event_id) AS unique_count, 'Count', distinct_stream.application_id, distinct_stream.app_version, 'metrics'
FROM (
    SELECT STREAM DISTINCT
        rowtime as window_time,
        "AnalyticsApp_001"."event_id" as event_id,
        "AnalyticsApp_001"."application_id" as application_id,
        "AnalyticsApp_001"."app_version" as app_version,
        STEP("AnalyticsApp_001".rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001"
) as distinct_stream
GROUP BY 
    application_id, 
    app_version,
    TIME_WINDOW,
    STEP(distinct_stream.window_time BY INTERVAL '1' MINUTE);
```

#### Flink Definition

```sql
INSERT INTO output_table (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'TotalEvents' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP, 
    COUNT(event_id) AS METRIC_UNIT_VALUE_INT, 
    'Count' AS METRIC_UNIT,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM (
    SELECT
        window_start,
        window_end,
        event.event_id AS event_id,
        application_id AS application_id,
        event.app_version AS app_version,
        ROW_NUMBER() OVER (PARTITION BY window_start, window_end, event.event_id ORDER BY rowtime asc) AS rownum
    FROM TABLE(TUMBLE(TABLE input_table, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
) AS distinct_stream
WHERE rownum = 1
GROUP BY
    window_start,
    window_end,
    application_id,
    app_version;
```

##### Modifications
- Operation Definition
    - With Flink, the query is no longer defined as a pump. Instead it is defined as an insert into. To run the query continuously, the statement is executed in a Flink statement set within the application (see [Application Deployment](#application-deployment)). 
    - Flink uses a standard `SELECT` instead of a `SELECT STREAM`
    - Table names for source and sink are different. Flink terminology for the source and sink is a [table instead of a stream](https://nightlies.apache.org/flink/flink-docs-release-1.20/docs/dev/table/sql/create/). 
- Windowing function
    - With Kinesis Data Analytics, the windowing is defined by using the `STEP` function to round the rowtime to the nearest minute and grouping based on the rounded attribute value.
    - Flink uses a [Windowing Table-Valued Function(TVF)](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/sql/queries/window-agg/) to indicate that a query is a tumbling windowed query. The function is defined on the table within the `FROM` section and adds `window_start` and `window_end` attributes to group on.
- Deduplication
    - With Kinesis Data Analytics, deduplication is performed by specifying `DISTINCT` on the inner select statement.
    - Within Flink, [`DISTINCT` can be used](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/sql/queries/select-distinct/), but it requires the storage of rows with a time to live (TTL) which is expensive.
    - An optimization done within Flink is to deduplicate based on a unique attribute instead of the entire row. `event.event_id` is defined as a random UUID that uniquely identifies the event. 
        - Deduplication is done using the [`ROW_NUMBER()` function](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/sql/queries/deduplication/) which assigns sequential numbers to rows with the same attribute value. 
        - The choice of `ASC` or `DESC` in the function determines whether to keep the first or last occurrence of the row. In this query, `ASC` is used to keep the first query.
        - The statement `WHERE rownum = 1` indicates to the Flink query planner that the query is performing deduplication.
    - A further optimization in Flink is to perform a windowing deduplication since the query is bounded within a time window. This allows Flink to only to save unique rows within each time window instead of global uniqueness. 
        - To [indicate to Flink that windowed deduplication is used](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/table/sql/queries/window-deduplication/), `window_start` and `window_end` are explicitly included at the beginning of the `ROW_NUMBER()` function.

### Total Logins
Count of logins within period
#### Kinesis Data Analytics Definition

```sql
CREATE OR REPLACE PUMP "LOGIN_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT STREAM 'TotalLogins', UNIX_TIMESTAMP(TIME_WINDOW), COUNT(distinct_stream.login_count) AS unique_count, 'Count', distinct_stream.application_id, distinct_stream.app_version, 'metrics'
FROM (
    SELECT STREAM DISTINCT 
      rowtime as window_time, 
      "AnalyticsApp_001"."event_id" as login_count, 
      "AnalyticsApp_001"."application_id" as application_id,
      "AnalyticsApp_001"."app_version" as app_version,
      STEP("AnalyticsApp_001".rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001"
    WHERE "AnalyticsApp_001"."event_type" = 'login'
) as distinct_stream 
GROUP BY 
    application_id,
    app_version,
    TIME_WINDOW,
    STEP(distinct_stream.window_time BY INTERVAL '1' MINUTE);
```

#### Flink Definition

```sql
INSERT INTO output_table (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'TotalLogins' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP, 
    COUNT(event_id) AS METRIC_UNIT_VALUE_INT, 
    'Count' AS METRIC_UNIT,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM (
    SELECT
        window_start,
        window_end,
        event.event_id AS event_id,
        application_id AS application_id,
        event.app_version AS app_version,
        ROW_NUMBER() OVER (PARTITION BY window_start, window_end, event.event_id ORDER BY rowtime asc) AS rownum
    FROM TABLE(TUMBLE(TABLE input_table, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
    WHERE event.event_type = 'login'
) AS distinct_stream
WHERE rownum = 1
GROUP BY
    window_start,
    window_end,
    application_id,
    app_version;
```

##### Modifications

### Knockouts By Spells
Get the number of knockouts by each spell used in a knockout in the period
#### Kinesis Data Analytics Definition

```sql
CREATE OR REPLACE PUMP "KNOCKOUTS_BY_SPELL_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_SPELL_ID, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT STREAM 'KnockoutsBySpell', UNIX_TIMESTAMP(TIME_WINDOW), SPELL_COUNT, 'Count', SPELL_ID, application_id, app_version, 'metrics'
FROM (
    SELECT STREAM
      events."spell_id" as SPELL_ID,
      events."application_id" as application_id,
      events."app_version" as app_version,
      count(*) as SPELL_COUNT,
      STEP(events.rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001" events
    WHERE events."spell_id" is not NULL
    AND events."event_type" = 'user_knockout'
    GROUP BY
      STEP (events.ROWTIME BY INTERVAL '1' MINUTE),
      events."spell_id",
      events."application_id",
      events."app_version"
    HAVING count(*) > 1
    ORDER BY STEP (events.ROWTIME BY INTERVAL '1' MINUTE), SPELL_COUNT desc
);
```

#### Flink Definition

```sql
INSERT INTO output_table (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_SPELL_ID,
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'KnockoutsBySpell' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP,
    COUNT(*) AS METRIC_UNIT_VALUE_INT,
    'Count' AS METRIC_UNIT,
    SPELL_ID AS DIMENSION_SPELL_ID,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM
(SELECT
    window_start,
    window_end,
    JSON_VALUE(event.event_data, '$.spell_id' RETURNING STRING NULL ON EMPTY) AS SPELL_ID,
    application_id AS application_id,
    event.app_version AS app_version
FROM TABLE(TUMBLE(TABLE input_table, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
WHERE 
    event.event_type = 'user_knockout') AS knockout_events
WHERE SPELL_ID IS NOT NULL
GROUP BY
    window_start,
    window_end,
    SPELL_ID,
    application_id,
    app_version
HAVING COUNT(*) > 1;
```

##### Modifications
- Attribute Access
    - The `JSON_VALUE` function is used to access the values within the `event.event_data` attribute.


### Purchases
Get all purchases grouped by country over the period
#### Kinesis Data Analytics Definition

```sql
CREATE OR REPLACE PUMP "PURCHASES_PER_CURRENCY_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_CURRENCY_TYPE, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT 'Purchases', UNIX_TIMESTAMP(TIME_WINDOW), PURCHASE_COUNT, 'Count', CURRENCY_TYPE, application_id, app_version, 'metrics' FROM (
    SELECT STREAM
      events."currency_type" as CURRENCY_TYPE,
      events."application_id" as application_id,
      events."app_version" as app_version,
      count(*) as PURCHASE_COUNT,
      STEP(events.rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001" events
    WHERE events."currency_type" is not NULL
    AND events."event_type" = 'iap_transaction'
    GROUP BY
      STEP (events.ROWTIME BY INTERVAL '1' MINUTE),
      events."currency_type",
      events."application_id",
      events."app_version"
    HAVING count(*) > 1
    ORDER BY STEP (events.ROWTIME BY INTERVAL '1' MINUTE), PURCHASE_COUNT desc
);
```

#### Flink Definition

```sql
INSERT INTO output_table (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_CURRENCY_TYPE,
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'Purchases' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP,
    COUNT(*) AS METRIC_UNIT_VALUE_INT,
    'Count' AS METRIC_UNIT,
    CURRENCY_TYPE AS DIMENSION_CURRENCY_TYPE,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM
(SELECT
    window_start,
    window_end,
    JSON_VALUE(event.event_data, '$.currency_type' RETURNING STRING NULL ON EMPTY) AS CURRENCY_TYPE,
    application_id AS application_id,
    event.app_version AS app_version
FROM TABLE(TUMBLE(TABLE input_table, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
WHERE 
    event.event_type = 'iap_transaction') AS transaction_events
WHERE CURRENCY_TYPE IS NOT NULL
GROUP BY
    window_start,
    window_end,
    CURRENCY_TYPE,
    application_id,
    app_version
HAVING COUNT(*) > 1;
```

##### Modifications


## Metric Output Stream
The first version of the Game Analytics Pipeline on AWS utilized a [Lambda function as a direct output destination for Kinesis Data Analytics](https://docs.aws.amazon.com/kinesisanalytics/latest/dev/how-it-works-output-lambda-functions.html). The Lambda function processes incoming metrics and emits them to CloudWatch Metrics via the SDK. This feature is not supported natively in Flink.

As an alternative, a separate Kinesis stream was utilized to decouple the Flink application from the Lambda. 

### Configuring the Stream Shard Count
The Metric Output Stream is a provisioned Kinesis stream. The number of shards in the stream can be controlled by the `METRIC_STREAM_SHARD_COUNT` parameter in your `config.yaml`. 

The number of shards can be determined using the formula found in the *Provisioned mode features and use cases* subsection of [Choose the data stream capacity mode](https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html#provisionedmode) in the *Amazon Kinesis Data Streams Developer Guide*.

Throughput considerations are determined by the characteristics of metrics emitted by Flink and the number of consumers for the stream. 

- The records per second is determined by the number of defined metrics, the number of distinct dimension combinations for each metric emitted for every windowing group, and the duration of the metric window. 

- The average data size is determined by the number and size of the dimensions defined for each metric record. 

- The number of consumers is dependent on the number of metric monitoring services, such as Cloudwatch metrics, consuming the stream.

### Consuming the Stream
This Kinesis stream is consumed directly by a Lambda which writes each metric record into a CloudWatch metric. The Kinesis stream is connected to the Lambda using a [Kinesis Event Source](https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html). 

Alternatively, the Kinesis stream can be consumed directly by a tool such as [OpenSearch](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/configure-client-kinesis.html).

## Development using Studio Notebooks

Studio notebooks are an interactive interface that allows you to query and visualize 

## Application Deployment