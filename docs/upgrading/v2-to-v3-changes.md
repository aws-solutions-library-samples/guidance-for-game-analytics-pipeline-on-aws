# Changes from V2 to V3

## As of 7/31/2025
---

## <u>Feature Updates</u>
- Added Iceberg table support, CTAS queries for creating Iceberg tables, and Glue scripts for converting Hive to Iceberg
- Added Opensearch as the new real-time dashboarding over CloudWatch metrics
- Added Terraform as a deployment option
- Added Redshift as a deployment option
---

## <u>Infrastructure Updates</u>
Upgraded infrastructure to the following: (INSERT BEFORE AND AFTERS HERE)
!!! Info
    Explanations can be found in [Component Deep Dive](../component-deep-dive.md) and [Design Considerations](../design-considerations.md)
- Replaced Kinesis Data Analytics with Managed Flink
- Added deployment option for Direct Batching to Firehose
- Removed Ops-pipeline components (Github Actions, CodeBuild, CodePipeline)
- Added S3 Tables option for Iceberg table support
- Lambda functions now run on Graviton
---

## <u>Configuration Updates</u>
- Added option/support for `ON_DEMAND` Kinesis Data Streams through `STREAM_PROVISIONED : true/false`
- Replaced `ENABLE_STREAMING_ANALYTICS` with `REAL_TIME_ANALYTICS: true | false`
- Added `INGEST_MODE: "KINESIS_DATA_STREAMS" | "DIRECT_BATCH"` to support future ingest options
- Added `DATA_STACK: "DATA_LAKE" | "REDSHIFT"` to support Redshift deployment option
- Added default values for configuration template file
- Added "iac" field to top-level package.json to support CDK or Terraform deployment options
- Reorganized config variables to functional groups
---

## <u>Administrative Updates</u>
- Added mkdocs and documentation to the repository
- Removed Solution Helper and custom resources dependency for CDK
- Streamlining esbuild as primary deployment option
- Created dashboard-construct to move CloudWatch Dashboard to a dedicated construct
- Revamped CloudWatch Dashboard, see [Ops Dashboard Reference](../references/ops-dashboard-reference.md) for latest state
- Added additional metrics for Flink, Opensearch, and Redshift to Operational Dashboard and dynamically builds based on deployment
---

## <u>Redshift Materialized View Changes</u>
When `DATA_STACK: "REDSHIFT"` is used, the `POST /redshift/setup` endpoint provisions
the Redshift objects. How the streaming data is modeled changed in V3:

- The streaming materialized view is now named **`event_data_mv`** (previously the
  materialized view was named `event_data`). It reads directly from the Kinesis Data
  Stream and stores each record as a single **`payload`** column of the `SUPER`
  (semi-structured) type: `json_parse(kinesis_data) AS payload`.
- Redshift does **not** allow a streaming materialized view to unnest or type-cast the
  JSON into individual typed columns in the same statement (attempting to navigate the
  parsed payload within the MV fails with
  `navigation on column "payload" is not allowed as it is not SUPER type`). All
  flattening therefore happens in views layered on top of `event_data_mv`.
- A regular (non-materialized) view named **`event_data`** is provided for **backward
  compatibility with V2**. It flattens `payload` back into the V2 column shape
  (`event_id`, `event_type`, `event_timestamp`, `application_id`, ... , with `event_data`
  and `metadata` exposed as JSON strings via `JSON_SERIALIZE`). Existing V2 queries such
  as `SELECT ... FROM event_data` and `JSON_EXTRACT_PATH_TEXT(event_data, 'field')`
  continue to work unchanged.
- The dashboard views (`total_plays_by_level`, `user_reported_reasons_count`, etc.) read
  `event_data_mv` directly and navigate the `SUPER` payload with dot notation, e.g.
  `events.payload.event.event_data.level_id::VARCHAR`.

!!! Note
    Because the flattening lives in a regular view rather than the materialized view,
    the type conversion for nested fields is performed at query time. This is a Redshift
    limitation for streaming materialized views, not a design choice.
---

## <u>Library Updates</u>
- Updated CDK version for repo
- Updated AWS SDK to v3
- Updated NPM libraries
- Updated Lambda libraries to Node v22
- Updated Glue Engine to 5.0
- Updated GlueParquet and Python UTC functions for Glue Script
- Now requires Maven and Terraform as library requirements