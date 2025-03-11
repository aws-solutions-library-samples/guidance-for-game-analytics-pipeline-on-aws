# Changes from V2 to V3

---
## <u>Infrastructure Updates</u>
Upgraded infrastructure to the following: (INSERT BEFORE AND AFTERS HERE)
!!! Info
    Explanations can be found in [Component Deep Dive](../component-deep-dive.html) and [Design Considerations](../design-considerations.html)
- API Gateway now uses Lambda to process routing and application logic instead of passthrough to Kinesis Data Streams
- Replaced Kinesis Data Analytics with Managed Flink
- Added option for MSK
- Removed Ops-pipeline components (Github Actions, CodeBuild, CodePipeline)
---

## <u>Feature Updates</u>
- Added Iceberg table support, CTAS queries for creating Iceberg tables, and Glue scripts for converting Hive to Iceberg
- Added additional metrics for Flink to Operational Dashboard
- Added Terraform as a deployment option
---

## <u>Configuration Updates</u>
- Added option/support for `ON_DEMAND` Kinesis Data Streams
- Added default values for configuration template file
---

## <u>Administrative Updates</u>
- Added mkdocs and documentation to the repository
- Removed Solution Helper and custom resources dependency for CDK
- Streamlining esbuild as primary deployment option
- Created dashboard-construct to move CloudWatch Dashboard to a dedicated construct
---

## <u>Library Updates</u>
- Updated CDK version for repo
- Updated AWS SDK to v3
- Updated NPM libraries
- Updated Lambda libraries to Node v22
- Updated GlueParquet and Python UTC functions for Glue Script
- Now requires Maven and Terraform as library requirements