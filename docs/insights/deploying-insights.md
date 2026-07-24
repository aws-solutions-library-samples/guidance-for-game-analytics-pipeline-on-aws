# Deploying Pre-Built Insights

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

If the `DATA_MODE` of the game analytics pipeline is set to `DATA_LAKE`, retrieve the following parameters from the GAP deployment output:

- `ANALYTICS_BUCKET_NAME` - The name of the S3 Bucket used for game analytics storage. Refer to the [Analytics Bucket Name](../references/output-reference.md#analytics-bucket-name) in the Output Reference.
- `ATHENA_WORKGROUP_NAME` - The name of the Athena Workgroup created to query Game Analytics data.

If the `DATA_MODE` of the game analytics pipeline is set to `REDSHIFT`, configure the following:

- `REDSHIFT_SECRET_ARN` - The ARN of the secrets manager secret used to sign into the Redshift Serverless workgroup. 
- `REDSHIFT_HOST` - The host endpoint inside the VPC for the Redshift Serverless workgroup.
- `REDSHIFT_VPC_ID` - The VPC created for the Game Analytics Pipeline.
- `REDSHIFT_SUBNET_IDS` - The private subnets created inside the Game Analytics Pipeline VPC.

### Deploying the Bootstrap module

## Deploying an Insight

## Granting permissions to access GAP Resources in Quick
