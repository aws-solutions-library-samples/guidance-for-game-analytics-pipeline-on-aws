# User Activity

This sample creates a medallion architecture pipeline for analyzing user activity patterns, including user status tracking, session duration, and daily engagement metrics.

This is the Terraform port of `user-activity-construct.ts`.

## What it creates

The sample supports both **DATA_LAKE** (Glue/Iceberg) and **REDSHIFT** modes, automatically deploying the appropriate resources based on your pipeline configuration.

### DATA_LAKE Mode (Glue/Iceberg)

| Resource | Purpose |
| --- | --- |
| `aws_glue_catalog_table.user_status` | Silver layer: tracks current state of each user (CURRENT, AT-RISK, DORMANT). |
| `aws_glue_catalog_table.user_status_transition` | Silver layer: tracks state transitions over time. |
| `aws_glue_catalog_table.user_counts` | Silver layer: daily aggregate counts by status. |
| `aws_glue_catalog_table.user_first_join` | Silver layer: user first join timestamps. |
| `aws_glue_catalog_table.sessions` | Silver layer: user session tracking with duration. |
| `aws_glue_catalog_table.daily_session_stats` | Gold layer: daily session statistics aggregation. |
| `aws_glue_job.user_activity_silver` | Glue 5.0 ETL job that processes raw events into silver tables. |
| `aws_glue_job.user_activity_gold` | Glue 5.0 ETL job that aggregates silver data into gold tables. |
| `aws_glue_workflow.user_activity_daily` | Daily Glue workflow that orchestrates silver → gold processing. |

### REDSHIFT Mode

| Resource | Purpose |
| --- | --- |
| `aws_redshiftdata_statement.user_status` | Redshift table for user status tracking. |
| `aws_redshiftdata_statement.user_status_transition` | Redshift table for user status transitions. |
| `aws_redshiftdata_statement.user_counts` | Redshift table for daily user counts by status. |
| `aws_redshiftdata_statement.user_first_join` | Redshift table for user first join timestamps. |
| `aws_redshiftdata_statement.sessions` | Redshift table for user sessions. |
| `aws_redshiftdata_statement.daily_session_stats` | Redshift table for daily session statistics. |
| `aws_sfn_state_machine.redshift_user_activity_etl` | Step Functions state machine with SQL batches for silver/gold layers. |
| `aws_scheduler_schedule.redshift_user_activity_etl` | EventBridge Scheduler for daily ETL execution. |

### QuickSight Assets (Both Modes)

| Resource | Purpose |
| --- | --- |
| `aws_quicksight_data_set.user_status` | QuickSight SPICE dataset for user status tracking. |
| `aws_quicksight_data_set.daily_session_stats` | QuickSight SPICE dataset for daily session statistics. |
| `aws_quicksight_template.playerbase_overview` | QuickSight template with KPIs and charts for user activity. |
| `aws_quicksight_analysis.playerbase_overview` | QuickSight analysis created from the template. |
| `aws_quicksight_folder_membership.*` | Folder memberships that add datasets and analysis to the GAP shared folder. |

## Prerequisites

1. **GAP infrastructure deployed.** The pipeline's Terraform stack must already be applied so that the analytics S3 bucket, Glue database, and ETL role exist. This module reads `infrastructure/config.yaml` for `WORKLOAD_NAME`, `EVENTS_DATABASE`, and `RAW_EVENTS_TABLE`.

2. **Quicksuite Bootstrap.** Run `samples/quicksuite-bootstrap` first to create the QuickSight data source, folder, and groups. This sample reads `samples/quicksuite-bootstrap/bootstrap-output.yaml` for the data source ARN and folder ID.

3. **For DATA_LAKE mode: Glue scripts uploaded.** The Glue jobs expect ETL scripts at:
   - `s3://<analytics-bucket>/glue-scripts/samples/user_activity_silver.py`
   - `s3://<analytics-bucket>/glue-scripts/samples/user_activity_gold.py`

4. **For REDSHIFT mode: Redshift setup.** The Redshift workgroup must exist and `POST /redshift/setup` must have been called to create the `event_data_mv` materialized view.

5. **Tools.** Terraform >= 1.x and AWS credentials with permission to manage Glue, Redshift, and QuickSight in the target account.

## Configuration

This module reads configuration from multiple sources (no `tfvars` required):

- `samples/config.yaml` — provides values specific to the samples. Copy `samples/config.yaml.TEMPLATE` to `samples/config.yaml` and fill in:

  | Key | Description |
  | --- | --- |
  | `ANALYTICS_BUCKET_NAME` | Name of the GAP analytics S3 bucket (output of the pipeline stack). |

- `samples/quicksuite-bootstrap/bootstrap-output.yaml` — created by quicksuite-bootstrap, containing:
  - `GAP_DATA_SOURCE_ARN` — ARN of the QuickSight data source (Athena or Redshift)
  - `GAP_FOLDER_ID` — ID of the QuickSight folder for GAP samples
  - Groups information for folder permissions

- `infrastructure/config.yaml` — the same config used to deploy the pipeline. This module reads:
  - `WORKLOAD_NAME` — used to name resources and calculate the Glue ETL role ARN.
  - `EVENTS_DATABASE` — the Glue database name.
  - `RAW_EVENTS_TABLE` — the source table name for the ETL job.
  - `DATA_STACK` — determines whether to deploy DATA_LAKE or REDSHIFT resources.

**Note:** The Glue ETL role ARN is automatically calculated from `WORKLOAD_NAME` using the naming convention `${WORKLOAD_NAME}-GameEventsEtlRole`.

## 1) Predeployment

### For DATA_LAKE Mode

1. Ensure the GAP pipeline is deployed with `DATA_STACK: "DATA_LAKE"` in `infrastructure/config.yaml`.
2. Run the quicksuite-bootstrap sample first.
3. Upload the Glue scripts to the analytics bucket:
   ```bash
   aws s3 cp business-logic/data-lake/glue-scripts/samples/user_activity_silver.py \
     s3://<analytics-bucket>/glue-scripts/samples/user_activity_silver.py
   
   aws s3 cp business-logic/data-lake/glue-scripts/samples/user_activity_gold.py \
     s3://<analytics-bucket>/glue-scripts/samples/user_activity_gold.py
   ```

### For REDSHIFT Mode

1. Ensure the GAP pipeline is deployed with `DATA_STACK: "REDSHIFT"` in `infrastructure/config.yaml`.
2. Run the quicksuite-bootstrap sample first.
3. Ensure the Redshift workgroup is active and `POST /redshift/setup` has been called to create the `event_data_mv` materialized view.

### For Both Modes

Create `samples/config.yaml` from the template and populate the required values:
```yaml
ANALYTICS_BUCKET_NAME: "your-analytics-bucket-name"
```

## 2) Deployment

```bash
cd samples/user-activity

terraform init
terraform plan
terraform apply
```

Apply typically takes a few minutes. After it completes, you will have:

**For DATA_LAKE mode:**
- Six Glue Iceberg tables (silver and gold layers)
- Two Glue ETL jobs (silver and gold processing)
- A Glue workflow for daily orchestration

**For REDSHIFT mode:**
- Six Redshift tables
- A Step Functions state machine with SQL batches for silver/gold processing
- An EventBridge Scheduler for daily execution

**For both modes:**
- Two QuickSight datasets
- A QuickSight template with KPIs and charts
- A QuickSight analysis ready to view and publish

## 3) Postdeployment

### For DATA_LAKE Mode: Run the Glue ETL jobs

Before the QuickSight datasets can show data, run the Glue jobs to populate the tables:

```bash
# Start the silver job
aws glue start-job-run --job-name "<WORKLOAD_NAME>-User-Activity-Silver"

# After silver completes, start the gold job
aws glue start-job-run --job-name "<WORKLOAD_NAME>-User-Activity-Gold"
```

Or trigger the entire workflow:
```bash
aws glue start-workflow-run --name "<WORKLOAD_NAME>-User-Activity-ETL-Daily"
```

### For REDSHIFT Mode: Trigger the Step Functions state machine

```bash
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:region:account:stateMachine:<WORKLOAD_NAME>-redshift-user-activity-etl"
```

The state machine will execute SQL batches to populate the silver and gold tables from the `event_data_mv` materialized view.

### Refresh the QuickSight datasets

After the ETL completes, refresh the SPICE datasets in QuickSight:

```bash
aws quicksight create-ingestion \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --data-set-id "user-status-<WORKLOAD_NAME>" \
  --ingestion-id "manual-refresh-$(date +%s)"

aws quicksight create-ingestion \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --data-set-id "daily-session-stats-<WORKLOAD_NAME>" \
  --ingestion-id "manual-refresh-$(date +%s)"
```

### View the analysis

1. Open QuickSight in the AWS Console.
2. Navigate to **Analyses**.
3. Open **Playerbase Overview**.
4. The analysis contains several visuals:
   - **Current Users by Status** — KPIs showing counts of CURRENT, AT-RISK, and DORMANT users
   - **User Status Transitions** — Chart showing user movement between status states
   - **Daily Session Statistics** — Charts showing total playtime, average session duration, and session counts

### Publish as a dashboard (optional)

To share the analysis as a read-only dashboard:

1. Open the analysis in QuickSight.
2. Click **Share** → **Publish dashboard**.
3. Enter a dashboard name and configure sharing options.

## Medallion Architecture

This sample implements a medallion architecture with silver and gold layers:

### Silver Layer
- **user_status**: Tracks the current state of each user
  - States: CURRENT (active), AT-RISK (7+ days inactive), DORMANT (28+ days inactive)
  - Updates on each user login event

- **user_status_transition**: Tracks state transitions over time
  - Records when users move between states
  - Useful for understanding churn and re-engagement patterns

- **user_counts**: Daily aggregate counts by status
  - Tracks the distribution of users across states
  - Enables trend analysis of user engagement

- **user_first_join**: Tracks when users first joined
  - Source event: `user_login`
  - Used by other samples for cohort analysis

- **sessions**: User session tracking with duration
  - Matches login/logout events by session_id
  - Calculates session duration in seconds

### Gold Layer
- **daily_session_stats**: Daily session statistics aggregation
  - Metrics: total_playtime, avg_playtime, session_count
  - Aggregated by date for trend analysis

## User Status Logic

The user status tracking implements a state machine:

```
CURRENT (active) → 7 days inactive → AT-RISK → 21 more days inactive → DORMANT
```

Users can move back to CURRENT when they login again:
- DORMANT → CURRENT (on login)
- AT-RISK → CURRENT (on login)

## Data Dependencies

The user-activity sample is a foundational sample that other samples depend on:

- **store-metrics** depends on the `sessions` table created by this sample
- **in-game-analysis** can use `user_first_join` for cohort analysis

Deploy this sample first before deploying dependent samples.

## File layout

```
samples/user-activity/
├── main.tf                        # All resources (Glue tables, jobs, Step Functions, QuickSight assets)
├── providers.tf                   # AWS provider + region
├── outputs.tf                     # Output values for tables, jobs, datasets, template, analysis
├── README.md                      # This file
├── quicksight_template.json       # Exported QuickSight template JSON
├── qs_template_request.json       # Template creation request JSON
└── user-activity-construct.ts     # Original CDK construct (kept for reference)
```

## Cleanup

```bash
terraform destroy
```

Note that QuickSight analyses must be deleted before datasets, and datasets before the template. Terraform handles this automatically when destroying resources.

## References

- [AWS Glue Catalog Table Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/glue_catalog_table)
- [AWS Glue Job Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/glue_job)
- [AWS Step Functions Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sfn_state_machine)
- [AWS QuickSight Dataset Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_data_set)
- [AWS QuickSight Template Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_template)
- [AWS QuickSight Analysis Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_analysis)
- [Apache Iceberg with AWS Glue](https://docs.aws.amazon.com/glue/latest/dg/aws-glue-programming-etl-format-iceberg.html)
- [Redshift SUPER Type](https://docs.aws.amazon.com/redshift/latest/dg/query-super.html)
