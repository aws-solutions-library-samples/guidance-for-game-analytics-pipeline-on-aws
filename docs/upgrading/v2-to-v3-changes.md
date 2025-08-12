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

## <u>Library Updates</u>
- Updated CDK version for repo
- Updated AWS SDK to v3
- Updated NPM libraries
- Updated Lambda libraries to Node v22
- Updated Glue Engine to 5.0
- Updated GlueParquet and Python UTC functions for Glue Script
- Now requires Maven and Terraform as library requirements