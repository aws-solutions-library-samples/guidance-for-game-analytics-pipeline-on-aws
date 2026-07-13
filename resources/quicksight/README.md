# QuickSight Dashboard & Dataset Templates (API format)

AWS API-format (PascalCase) JSON templates for **manual** deployment of the game
analytics QuickSight dashboard via the AWS CLI. Every account-, region-, ARN-, and
workload-specific value is a `<PLACEHOLDER>` token that you replace before use.

> **Data source scope:** these templates target **Amazon Redshift Serverless** as the
> QuickSight data source. The dataset SQL uses Redshift-specific syntax — SUPER-path
> field access (`events.payload...`), Redshift casts (`::VARCHAR`), `date_trunc`, and
> `"<EVENTS_DATABASE>"."public"."event_data"` naming — and is **not** Athena-compatible.

## Files

| File                                   | Purpose                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard-definition.json`            | Full `create-dashboard` input: `AwsAccountId`, `DashboardId`, `Name`, `Definition` (6 dataset identifier declarations, 5 sheets, 45 filter groups), and `Permissions`. |
| `datasets/all_events.json`             | `create-data-set` input for the `all_events` view.                                                                                                                     |
| `datasets/match_events.json`           | `create-data-set` input for the `match_events` view.                                                                                                                   |
| `datasets/level_events.json`           | `create-data-set` input for the `level_events` view.                                                                                                                   |
| `datasets/economy_events.json`         | `create-data-set` input for the `economy_events` view.                                                                                                                 |
| `datasets/player_health.json`          | `create-data-set` input for the `player_health` view.                                                                                                                  |
| `datasets/match_lifecycle_funnel.json` | `create-data-set` input for the `match_lifecycle_funnel` view.                                                                                                         |

## Placeholders

Replace every occurrence before calling the AWS CLI.

| Placeholder                            | Meaning                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `<AWS_ACCOUNT_ID>`                     | Your 12-digit AWS account ID.                                                                                                 |
| `<REGION>`                             | AWS region (e.g. `us-east-1`).                                                                                                |
| `<WORKLOAD_NAME>`                      | Workload name prefix used in dataset/dashboard IDs and names.                                                                 |
| `<DATA_SOURCE_ARN>`                    | ARN of the QuickSight data source backing the datasets.                                                                       |
| `<DATASET_ARN_all_events>`             | ARN of the created `all_events` dataset.                                                                                      |
| `<DATASET_ARN_match_events>`           | ARN of the created `match_events` dataset.                                                                                    |
| `<DATASET_ARN_level_events>`           | ARN of the created `level_events` dataset.                                                                                    |
| `<DATASET_ARN_economy_events>`         | ARN of the created `economy_events` dataset.                                                                                  |
| `<DATASET_ARN_player_health>`          | ARN of the created `player_health` dataset.                                                                                   |
| `<DATASET_ARN_match_lifecycle_funnel>` | ARN of the created `match_lifecycle_funnel` dataset.                                                                          |
| `<QUICKSIGHT_PRINCIPAL_ARN>`           | ARN of the QuickSight user/group granted permissions.                                                                         |
| `<QUICKSIGHT_USERNAME>`                | QuickSight user name.                                                                                                         |
| `<VPC_CONNECTION_ID>`                  | VPC connection ID for the data source, if used.                                                                               |
| `<EVENTS_DATABASE>`                    | The Redshift database configured as `EVENTS_DATABASE` in `config.yaml`; the schema is `public` and the table is `event_data`. |

## Creation order

1. Create the QuickSight **data source** and capture its ARN into `<DATA_SOURCE_ARN>`.
2. Create the six **datasets** (`datasets/*.json`); capture each returned ARN into the
   matching `<DATASET_ARN_*>` token.
3. Create the **dashboard** (`dashboard-definition.json`) using those dataset ARNs.

The full step-by-step walkthrough ships separately.

## Provenance

These templates were generated from the project's CDK-based QuickSight definitions.
