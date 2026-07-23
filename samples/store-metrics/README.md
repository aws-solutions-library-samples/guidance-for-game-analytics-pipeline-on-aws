# Store Metrics

This sample creates a medallion architecture pipeline for analyzing in-game store metrics, including item clicks, purchases, revenue, and user lifetime value (LTV).

This is the Terraform port of `store-metrics-construct.ts`.

## What it creates

The sample supports both **DATA_LAKE** (Glue/Iceberg) and **REDSHIFT** modes, automatically deploying the appropriate resources based on your pipeline configuration.

### DATA_LAKE Mode (Glue/Iceberg)

| Resource | Purpose |
| --- | --- |
| `aws_glue_catalog_table.item_prices` | Iceberg table for static item pricing reference data. |
| `aws_glue_catalog_table.daily_item_store_metrics` | Silver layer: daily item store metrics (clicks, quantity, gross, transactions). |
| `aws_glue_catalog_table.daily_user_purchase_metrics` | Silver layer: daily user purchase metrics by session. |
| `aws_glue_catalog_table.user_first_join` | Silver layer: user first join timestamps for LTV calculations. |
| `aws_glue_catalog_table.user_ltv` | Gold layer: user lifetime value metrics. |
| `aws_glue_job.store_metrics_silver` | Glue 5.0 ETL job that processes raw events into silver tables. |
| `aws_glue_job.store_metrics_gold` | Glue 5.0 ETL job that aggregates silver data into gold tables. |
| `aws_glue_workflow.store_metrics_daily` | Daily Glue workflow that orchestrates silver → gold processing. |

### REDSHIFT Mode

| Resource | Purpose |
| --- | --- |
| `aws_redshiftdata_statement.item_prices` | Redshift table for item pricing reference data. |
| `aws_redshiftdata_statement.daily_item_store_metrics` | Redshift table for daily item store metrics. |
| `aws_redshiftdata_statement.daily_user_purchase_metrics` | Redshift table for daily user purchase metrics. |
| `aws_redshiftdata_statement.user_first_join` | Redshift table for user first join timestamps. |
| `aws_redshiftdata_statement.user_ltv` | Redshift table for user lifetime value. |
| `aws_sfn_state_machine.redshift_store_metrics_etl` | Step Functions state machine with SQL batches for silver/gold layers. |
| `aws_scheduler_schedule.redshift_store_metrics_etl` | EventBridge Scheduler for daily ETL execution. |

### QuickSight Assets (Both Modes)

| Resource | Purpose |
| --- | --- |
| `aws_quicksight_data_set.daily_item_store_metrics` | QuickSight SPICE dataset with calculated fields for units/gross per transaction. |
| `aws_quicksight_data_set.user_ltv` | QuickSight SPICE dataset for user lifetime value metrics. |
| `aws_quicksight_template.store_metrics` | QuickSight template with KPIs and charts for store metrics. |
| `aws_quicksight_analysis.store_metrics` | QuickSight analysis created from the template. |
| `aws_quicksight_folder_membership.*` | Folder memberships that add datasets and analysis to the GAP shared folder. |

## Prerequisites

1. **GAP infrastructure deployed.** The pipeline's Terraform stack must already be applied so that the analytics S3 bucket, Glue database, and ETL role exist. This module reads `infrastructure/config.yaml` for `WORKLOAD_NAME`, `EVENTS_DATABASE`, and `RAW_EVENTS_TABLE`.

2. **Quicksuite Bootstrap.** Run `samples/quicksuite-bootstrap` first to create the QuickSight data source, folder, and groups. This sample reads `samples/quicksuite-bootstrap/bootstrap-output.yaml` for the data source ARN and folder ID.

3. **For DATA_LAKE mode: Glue scripts uploaded.** The Glue jobs expect ETL scripts at:
   - `s3://<analytics-bucket>/glue-scripts/samples/store_metrics_silver.py`
   - `s3://<analytics-bucket>/glue-scripts/samples/store_metrics_gold.py`

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
   aws s3 cp business-logic/data-lake/glue-scripts/samples/store_metrics_silver.py \
     s3://<analytics-bucket>/glue-scripts/samples/store_metrics_silver.py
   
   aws s3 cp business-logic/data-lake/glue-scripts/samples/store_metrics_gold.py \
     s3://<analytics-bucket>/glue-scripts/samples/store_metrics_gold.py
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
cd samples/store-metrics

terraform init
terraform plan
terraform apply
```

Apply typically takes a few minutes. After it completes, you will have:

**For DATA_LAKE mode:**
- Five Glue Iceberg tables (silver and gold layers)
- Two Glue ETL jobs (silver and gold processing)
- A Glue workflow for daily orchestration

**For REDSHIFT mode:**
- Five Redshift tables
- A Step Functions state machine with SQL batches for silver/gold processing
- An EventBridge Scheduler for daily execution

**For both modes:**
- Two QuickSight datasets with calculated fields
- A QuickSight template with KPIs and charts
- A QuickSight analysis ready to view and publish

## 3) Postdeployment

### For DATA_LAKE Mode: Run the Glue ETL jobs

Before the QuickSight datasets can show data, run the Glue jobs to populate the tables:

```bash
# Start the silver job
aws glue start-job-run --job-name "<WORKLOAD_NAME>-Store-Metrics-Silver"

# After silver completes, start the gold job
aws glue start-job-run --job-name "<WORKLOAD_NAME>-Store-Metrics-Gold"
```

Or trigger the entire workflow:
```bash
aws glue start-workflow-run --name "<WORKLOAD_NAME>-Store-Metrics-ETL-Daily"
```

### For REDSHIFT Mode: Trigger the Step Functions state machine

```bash
aws stepfunctions start-execution \
  --state-machine-arn "arn:aws:states:region:account:stateMachine:<WORKLOAD_NAME>-redshift-store-metrics-etl"
```

The state machine will execute SQL batches to populate the silver and gold tables from the `event_data_mv` materialized view.

### Refresh the QuickSight datasets

After the ETL completes, refresh the SPICE datasets in QuickSight:

```bash
aws quicksight create-ingestion \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --data-set-id "daily-item-store-metrics-<WORKLOAD_NAME>" \
  --ingestion-id "manual-refresh-$(date +%s)"

aws quicksight create-ingestion \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --data-set-id "user-ltv-<WORKLOAD_NAME>" \
  --ingestion-id "manual-refresh-$(date +%s)"
```

### View the analysis

1. Open QuickSight in the AWS Console.
2. Navigate to **Analyses**.
3. Open **Store Metrics Analysis**.
4. The analysis contains several visuals:
   - **Total Gross Sales** — KPI showing total revenue with trend
   - **Total Unit Sales** — KPI showing total quantity sold with trend
   - **Total Transactions** — KPI showing transaction count with trend
   - **Average Units per Transaction** — KPI showing average basket size
   - **Average Gross per Transaction** — KPI showing average transaction value
   - **Transactions Per Day** — Line chart showing transaction trends over time

### Publish as a dashboard (optional)

To share the analysis as a read-only dashboard:

1. Open the analysis in QuickSight.
2. Click **Share** → **Publish dashboard**.
3. Enter a dashboard name and configure sharing options.

## Medallion Architecture

This sample implements a medallion architecture with silver and gold layers:

### Silver Layer
- **daily_item_store_metrics**: Aggregates store events by item and date
  - Source events: `store_purchase`, `store_click`
  - Metrics: clicks, quantity, gross revenue, transactions
  - Joined with `item_prices` table for revenue calculation

- **daily_user_purchase_metrics**: Tracks user purchases by session
  - Source event: `store_purchase`
  - Metrics: gross, first_purchase_time, session_date
  - Joined with `sessions` table (from user-activity sample)

- **user_first_join**: Tracks when users first joined
  - Source event: `user_login`
  - Used for LTV calculations in gold layer

### Gold Layer
- **user_ltv**: User lifetime value metrics
  - Aggregates all user purchases
  - Calculates: lifetime_value, days_to_first_monetization, monetization_date
  - Joined with user_first_join for monetization timing analysis

## Data Dependencies

This sample has a dependency on the **user-activity** sample:

- The `daily_user_purchase_metrics` silver table joins with the `sessions` table created by the user-activity sample.
- Ensure the user-activity sample is deployed and the `sessions` table exists before running the store-metrics ETL.

## File layout

```
samples/store-metrics/
├── main.tf                        # All resources (Glue tables, jobs, Step Functions, QuickSight assets)
├── providers.tf                   # AWS provider + region
├── outputs.tf                     # Output values for tables, jobs, datasets, template, analysis
├── README.md                      # This file
├── quicksight_template.json       # Exported QuickSight template JSON
├── qs_template_request.json       # Template creation request JSON
└── store-metrics-construct.ts     # Original CDK construct (kept for reference)
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
