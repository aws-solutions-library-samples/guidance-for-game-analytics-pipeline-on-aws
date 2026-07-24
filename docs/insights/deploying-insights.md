# Deploying Pre-Built Insights

This guide walks through deploying the pre-built insight modules to analyze your game analytics data. Each module includes data processing pipelines and QuickSight visualizations.

---

## Prerequisites

The following are required before deploying the insight modules:

- **Game Analytics Pipeline deployed**. The pipeline infrastructure must be deployed in your AWS account. See the [Getting Started guide](../getting-started.md) for deployment instructions.

- **Pipeline configuration file**. The `infrastructure/config.yaml` file used to deploy the pipeline must be available.

- **AWS credentials configured**. Your AWS CLI or environment must have credentials with permissions to manage QuickSight, IAM, and the data resources (Athena or Redshift). See [AWS CLI Configuration](../getting-started.md#aws-cli-configuration) for credential setup instructions.

- **Terraform installed**. HashiCorp Terraform >= 1.x must be installed on your machine. See [Environment setup](../getting-started.md#set-up-environment) for installation instructions.

- **QuickSight account**. An Amazon QuickSight Enterprise subscription must be configured in your AWS account. See the [AWS QuickSight documentation](https://docs.aws.amazon.com/quicksight/latest/user/signing-up.html) for setup instructions.

---

## Configure the Samples

Insights use a separate `config.yaml` file located in the `/samples` folder of the repository.

Copy the configuration template to create your local configuration file:

   ```bash
   cp samples/config.yaml.TEMPLATE samples/config.yaml
   ```

Open `samples/config.yaml` for editing. Configure the parameters based on your data mode:

=== "DATA_LAKE Mode"

    If the `DATA_STACK` configuration in your pipeline `infrastructure/config.yaml` is set to `DATA_LAKE`, configure these parameters:

    | Parameter | Description |
    | --- | --- |
    | `ANALYTICS_BUCKET_NAME` | The name of the S3 bucket used for game analytics storage. Retrieve the value from the [pipeline deployment outputs](../references/output-reference.md#analytics-bucket-name). |
    | `ATHENA_WORKGROUP_NAME` | The name of the Athena workgroup created for querying Game Analytics data. |

=== "REDSHIFT Mode"

    If the `DATA_STACK` configuration in your pipeline `infrastructure/config.yaml` is set to `REDSHIFT`, configure these parameters:

    | Parameter | Description |
    | --- | --- |
    | `REDSHIFT_SECRET_ARN` | The ARN of the Secrets Manager secret used to authenticate to the Redshift Serverless workgroup. |
    | `REDSHIFT_HOST` | The host endpoint inside the VPC for the Redshift Serverless workgroup. |
    | `REDSHIFT_VPC_ID` | The VPC ID created for the Game Analytics Pipeline. |
    | `REDSHIFT_SUBNET_IDS` | A comma-separated list of private subnet IDs created inside the Game Analytics Pipeline VPC. |

Configure the QuickSight service role:

   | Parameter | Description |
   | --- | --- |
   | `QUICKSIGHT_SERVICE_ROLE_ARN` | The ARN of the QuickSight service role. By default, QuickSight creates a role named `aws-quicksight-service-role-v0`. To validate, navigate to QuickSight > Manage account > Permissions > AWS resources. |

---

## Bootstrap QuickSight

The bootstrap module creates shared resources that all insight modules use. This must be deployed first.

### What it Creates

The bootstrap module creates:

- An IAM policy attached to the QuickSight service role that grants access to Game Analytics Pipeline data resources
- A QuickSight data source (Athena or Redshift) that connects to your pipeline data
- A QuickSight folder to hold all insight assets with cascading permissions
- Three QuickSight groups (admin, writer, reader) with different permission levels on the folder

### Deploy the Bootstrap Module

Navigate to the bootstrap module:

   ```bash
   cd samples/quicksuite-bootstrap
   ```

Initialize the Terraform module:

   ```bash
   terraform init
   ```

Review the deployment plan:

   ```bash
   terraform plan
   ```

Deploy the module:

   ```bash
   terraform apply
   ```

After deployment succeeds, a `bootstrap-output.yaml` file is created in the module directory containing references to the created resources. This file is required for deploying individual insight modules, make sure the output is saved for the subsequent insight deployment.

---

## Deploy an Insight Module

After the bootstrap module is deployed, you can deploy individual insight modules. Each module creates tables, data processing jobs (Glue or Step Functions), and QuickSight visualizations.

### Predeployment Steps

Ensure the `bootstrap-output.yaml` file exists at `samples/quicksuite-bootstrap/bootstrap-output.yaml`.

Ensure the all of the steps to configure the game analytics pipeline in the [Getting Started guide](../getting-started.md) have been followed.

### Deploy the Module

Navigate to the insight module directory:

   ```bash
   cd samples/user-activity
   ```

Initialize the Terraform module:

   ```bash
   terraform init
   ```

Review the deployment plan:

   ```bash
   terraform plan
   ```

Deploy the module:

   ```bash
   terraform apply
   ```

The module reads from `bootstrap-output.yaml`, `samples/config.yaml`, and `infrastructure/config.yaml` to determine resource names and locations.

Follow any additional steps mentioned in the module's README.md

### Postdeployment Steps

After deployment, process your event data:

=== "DATA_LAKE Mode"

    Run the Glue ETL jobs to populate the tables:

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

=== "REDSHIFT Mode"

    Trigger the Step Functions state machine:

    ```bash
    aws stepfunctions start-execution \
        --state-machine-arn "arn:aws:states:region:account:stateMachine:<WORKLOAD_NAME>-redshift-user-activity-etl"
    ```

    The state machine executes SQL batches to populate the silver and gold tables from the `event_data_mv` materialized view.

After the ETL completes, refresh the QuickSight SPICE datasets:

```bash
aws quicksight create-ingestion \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --data-set-id "user-status-<WORKLOAD_NAME>" \
  --ingestion-id "manual-refresh-$(date +%s)"
```

---


## Add Users to Groups

The bootstrap module creates three groups with different permission levels:

| Group | Permission Level | Capabilities |
| --- | --- | --- |
| `<workload>-admin` | Folder Owner | Full control of the folder, its assets, and permissions |
| `<workload>-writer` | Folder Contributor | Create, edit, and delete assets; cannot change folder permissions |
| `<workload>-reader` | Folder Viewer | Read-only access to all assets in the folder |

To add a user to a group:

```bash
aws quicksight create-group-membership \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --namespace default \
  --group-name <workload>-reader \
  --member-name <quicksight-username>
```

## View the Analysis

1. Open the QuickSight console at https://quicksight.aws.amazon.com/

2. Navigate to **Analyses** in the left sidebar

3. Open the analysis for your deployed module:

4. The analysis contains pre-built visualizations showing key metrics for your game

For details on each module's visualizations, see [Available Insights](./available-insights.md).

### Publish as a Dashboard (Optional)

To share the analysis as a read-only dashboard:

1. Open the analysis in QuickSight

2. Click **Share** → **Publish dashboard**

3. Enter a dashboard name and configure sharing options

---

## Cleanup

To remove deployed insight modules:

```bash
cd samples/<module-name>
terraform destroy
```

QuickSight analyses must be deleted before datasets, and datasets before templates. Terraform handles this automatically when destroying resources.

!!! Warning
   Destroying the bootstrap module removes the shared data source and folder. Remove all insight modules before destroying the bootstrap module.
