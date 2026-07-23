# Pre-Built Insights

The Game Analytics Pipeline contains a set of pre-built insights to address common industry use cases. These solutions can be optionally enabled and will deploy additional processing jobs to analyze raw event data and generate insights. For consistency, these insights are built upon event types available in the [Event Library](../references/event-library/event-library.md) to consistently define the structure of the data that the insights solutions will process.

Insights are generated from collected events using Amazon Glue ETL jobs and Amazon Redshift. The insights are visualized in Amazon QuickSight. For orchestration, scheduled Glue workflows are used to orchestrate insight generation on data lake data and scheduled queries using EventBridge, Step Functions, and the Redshift Data API are used to orchestrate insight transformation on data warehouse data. Additional charges will apply for these scheduled jobs.

Each insight is a separate deployable Terraform module that will set up the necessary data processing jobs, tables, and QuickSight resources. The account will need to be bootstrapped first to configure QuickSight to have appropriate permissions to access game analytics pipeline data. The modules are located in the samples folder within the repository. Each module has its own readme with pre-deployment, deployment, and post-deployment steps to follow.

---

## Bootstrapping the Account

### Prerequisites

- An AWS account with the Game Analytics Pipeline deployed in the account and region. For instructions on how to do so, please refer to the [Getting Started guide](../getting-started.md).
- The `config.yaml` used to deploy the game analytics pipeline must be configured and available at `/infrastructure/config.yaml`. 
- AWS credentials must be configured with appropriate permissions on the deploying machine to deploy within the AWS account. Please refer to the [AWS CLI Configuration Section of the Getting Started guide](../getting-started.md#aws-cli-configuration) for credential configuration instructions.
- Hashicorp Terraform must be installed on the deploying machine. Please refer to the [Environment setup section of the Getting Started guide](../getting-started.md#set-up-environment) for configuration instructions.
- Amazon Quick must be set up within the AWS account. For instructions on how to do so, please refer to [AWS Documentation](https://docs.aws.amazon.com/quick/latest/userguide/setting-up.html).

### Configuring the insights

Insights have a separate `config.yaml` file located within the `/samples` folder of the repository. To start, copy the existing `config.yaml.TEMPLATE` to a new file called `config.yaml`. Configure the config.yaml according to the following:

- `QUICKSIGHT_SERVICE_ROLE_ARN` - This is the ARN of the QuickSight service role. When Quick is configured, by default the Quick-managed role will be named `aws-quicksight-service-role-v0`, but certain environments may use a different role. To validate the servie role used, as an Administrator navigate to the Quick UI > Manage account at the top right menu > Permissions > AWS resources.

If the `DATA_MODE` of the game analytics pipeline is set to `DATA_LAKE`, configure the following:

- ANALYTICS_BUCKET_NAME
- ATHENA_WORKGROUP_NAME

If the `DATA_MODE` of the game analytics pipeline is set to `REDSHIFT`, configure the following:

- REDSHIFT_SECRET_ARN
- REDSHIFT_HOST
- REDSHIFT_VPC_ID
- REDSHIFT_SUBNET_IDS

### Deploying the Bootstrap module

## Deploying an Insight

## Granting permissions to access GAP Resources in Quick

---
## FAQ

### What costs are associated with the insights?

#### Data Processing & Storage

Data processing and storage costs will vary depending on the data format (data lake or data warehouse) as well as the volume of data ingested per-day. 

#### Orchestration

For data lake insights, orchestration using [Glue workflows](https://docs.aws.amazon.com/glue/latest/dg/workflows_overview.html) is provided at no additional charge. 

For data warehouse insights, queries are scheduled using Amazon EventBridge and orchestrated using AWS Step Functions. [Amazon EventBridge](https://aws.amazon.com/eventbridge/pricing/) is billed per scheduled invocation and [AWS Step Functions](https://aws.amazon.com/step-functions/pricing/) are billed per state transition.

#### Amazon Quick

[Amazon Quick](https://aws.amazon.com/quick/quicksight/pricing/) pricing varies depending on the consumption mode (capacity based or per-user licensing). Users can opt-in to additional AI features by upgrading their license to a pro license, which incurs additional charges.

The quick integration configures data source and datasets using Athena or Redshift and creates analyses to visualize the data. Quick SPICE can be used to cache and accelerate visualizations at an additional charge.

### Why are insights deployed outside of the main Game Analytics Pipeline infrastructure stack?

Manual account-wide steps are needed to configure your AWS account to support Amazon Quick. These steps incur additional costs and the configuration of Amazon Quick varies depending on a customer's organizational structure. Because of this, we do not automate the deployment of Amazon Quick by default and require users to opt-in to Amazon Quick manually.

Insights are also designed to be modular. Each insight deploys a complete set of data transformation pipelines, medallion architecture tables, and visualization for a specific Games industry use-case. 

### Why are insights only available as Terraform modules?

The pre-built insights require several resources that currently are not deployable using AWS CDK, such as QuickSight folders and groups and Redshift Data API operations. 