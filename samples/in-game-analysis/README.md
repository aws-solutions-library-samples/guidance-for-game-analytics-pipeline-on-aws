# In-Game Analysis

This sample creates Glue Iceberg tables and QuickSight assets for analyzing in-game events such as item actions and trades.

This is the Terraform port of `in-game-analysis-construct.ts`.

## What it creates

| Resource | Purpose |
| --- | --- |
| `aws_glue_catalog_table.in_game_events` | Iceberg table for daily item actions (item_id, item_action, event_date, app_version, occurrences). |
| `aws_glue_catalog_table.in_game_trades` | Iceberg table for daily item trades (traded_item, received_item, event_date, app_version, occurrences). |
| `aws_glue_job.in_game_events_etl` | Glue 5.0 ETL job that processes raw events into the in-game analytics tables. |
| `aws_quicksight_data_set.daily_item_actions` | QuickSight SPICE dataset backed by the daily_item_actions Glue table. |
| `aws_quicksight_data_set.daily_item_trades` | QuickSight SPICE dataset backed by the daily_item_trades Glue table. |
| `aws_quicksight_template.in_game` | QuickSight template with a bar chart for item actions and a sankey diagram for item trades. |
| `aws_quicksight_analysis.in_game_events` | QuickSight analysis created from the template. |
| `aws_quicksight_folder_membership.*` | Folder memberships that add datasets and analysis to the GAP shared folder, inheriting permissions from the folder. |

## Prerequisites

1. **GAP infrastructure deployed.** The pipeline's Terraform stack must already be applied so that the analytics S3 bucket, Glue database, and ETL role exist. This module reads `infrastructure/config.yaml` for `WORKLOAD_NAME`, `EVENTS_DATABASE`, and `RAW_EVENTS_TABLE`.
2. **Quicksuite Bootstrap.** Run `samples/quicksuite-bootstrap` first to create the QuickSight data source, folder, and groups. This sample reads `samples/quicksuite-bootstrap/bootstrap-output.yaml` for the data source ARN and folder ID.
3. **Glue script uploaded.** The Glue job expects the ETL script at `s3://<analytics-bucket>/glue-scripts/samples/in_game_analysis.py`. Upload the script before running the Glue job.
4. **Tools.** Terraform >= 1.x and AWS credentials with permission to manage Glue and QuickSight in the target account.

## Configuration

This module reads configuration from multiple sources (no `tfvars` required):

- `samples/config.yaml` — provides values specific to the samples. Copy `samples/config.yaml.TEMPLATE` to `samples/config.yaml` and fill in:

  | Key | Description |
  | --- | --- |
  | `ANALYTICS_BUCKET_NAME` | Name of the GAP analytics S3 bucket (output of the pipeline stack). |

- `samples/quicksuite-bootstrap/bootstrap-output.yaml` — created by quicksuite-bootstrap, containing:
  - `GAP_DATA_SOURCE_ARN` — ARN of the QuickSight Athena data source
  - `GAP_FOLDER_ID` — ID of the QuickSight folder for GAP samples
  - Groups information for folder permissions

- `infrastructure/config.yaml` — the same config used to deploy the pipeline. This module reads:
  - `WORKLOAD_NAME` — used to name resources and calculate the Glue ETL role ARN.
  - `EVENTS_DATABASE` — the Glue database name.
  - `RAW_EVENTS_TABLE` — the source table name for the ETL job.

**Note:** The Glue ETL role ARN is automatically calculated from `WORKLOAD_NAME` using the naming convention `${WORKLOAD_NAME}-GameEventsEtlRole`.

The AWS region is set in `providers.tf` (defaults to `us-east-1`); change it there if your QuickSight account lives elsewhere.

## 1) Predeployment

1. Ensure the GAP pipeline is deployed and you have the following:
   - Analytics bucket name
   - Glue ETL role ARN
   - QuickSight data source ARN
2. Run the quicksuite-bootstrap sample first to create the QuickSight data source.
3. Upload the Glue script to the analytics bucket:
   ```bash
   aws s3 cp business-logic/glue/scripts/samples/in_game_analysis.py \
     s3://<analytics-bucket>/glue-scripts/samples/in_game_analysis.py
   ```
4. Create `samples/config.yaml` from the template and populate the required values. Add the additional keys required by this sample:
   ```yaml
   QUICKSIGHT_SERVICE_ROLE_ARN: "arn:aws:iam::ACCOUNT_ID:role/service-role/aws-quicksight-service-role-v0"
   ANALYTICS_BUCKET_NAME: "your-analytics-bucket-name"
   ATHENA_WORKGROUP_NAME: "your-athena-workgroup"
   GLUE_ETL_ROLE_ARN: "arn:aws:iam::ACCOUNT_ID:role/your-glue-etl-role"
   GAP_DATA_SOURCE_ARN: "arn:aws:quicksight:region:account:datasource/game-analytics-pipeline-data-source"
   ```

## 2) Deployment

```bash
cd samples/in-game-analysis

terraform init
terraform plan
terraform apply
```

Apply typically takes a few minutes. After it completes, you will have:

- Two Glue Iceberg tables for in-game analytics.
- A Glue ETL job ready to process raw events.
- Two QuickSight datasets pointing at the tables.
- A QuickSight template with visualizations.
- A QuickSight analysis ready to view and publish.

## 3) Postdeployment

### Run the Glue ETL job

Before the QuickSight datasets can show data, run the Glue job to populate the tables:

```bash
aws glue start-job-run --job-name "<WORKLOAD_NAME>-In-Game-ETL"
```

### Refresh the QuickSight datasets

After the Glue job completes, refresh the SPICE datasets in QuickSight:

```bash
aws quicksight create-ingestion \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --data-set-id "daily-item-actions-<WORKLOAD_NAME>" \
  --ingestion-id "manual-refresh-$(date +%s)"

aws quicksight create-ingestion \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --data-set-id "daily-item-trades-<WORKLOAD_NAME>" \
  --ingestion-id "manual-refresh-$(date +%s)"
```

### View the analysis

1. Open QuickSight in the AWS Console.
2. Navigate to **Analyses**.
3. Open **In-Game Events Analysis**.
4. The analysis contains two visuals:
   - **In-game actions per item** — Bar chart showing item actions by item ID, colored by action type.
   - **In-game trades** — Sankey diagram showing item trade flows between traded and received items.

### Publish as a dashboard (optional)

To share the analysis as a read-only dashboard:

1. Open the analysis in QuickSight.
2. Click **Share** → **Publish dashboard**.
3. Enter a dashboard name and configure sharing options.

## File layout

```
samples/in-game-analysis/
├── main.tf                      # All resources (Glue tables, job, QuickSight assets)
├── providers.tf                 # AWS provider + region
├── outputs.tf                   # Output values for table names, job, datasets, template, analysis
├── README.md                    # This file
└── in-game-analysis-construct.ts # Original CDK construct (kept for reference)
```

## Cleanup

```bash
terraform destroy
```

Note that QuickSight analyses must be deleted before datasets, and datasets before the template. Terraform handles this automatically when destroying resources.

## References

- [AWS Glue Catalog Table Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/glue_catalog_table)
- [AWS Glue Job Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/glue_job)
- [AWS QuickSight Dataset Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_data_set)
- [AWS QuickSight Template Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_template)
- [AWS QuickSight Analysis Terraform Resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_analysis)
- [Apache Iceberg with AWS Glue](https://docs.aws.amazon.com/glue/latest/dg/aws-glue-programming-etl-format-iceberg.html)
