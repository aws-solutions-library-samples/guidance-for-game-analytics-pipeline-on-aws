# QuickSight Bootstrap

This sample bootstraps Amazon QuickSight (formerly QuickSuite) so that it can read data produced by the Game Analytics Pipeline (GAP) and so that GAP sample assets (analyses, dashboards, datasets) have a consistent home with role-based access control.

This is the Terraform port of `quicksuite-construct.ts` plus a folder/group layout for organizing and sharing the GAP samples.

## What it creates

| Resource | Purpose |
| --- | --- |
| `aws_iam_role_policy_attachment.quicksight_athena_access` | Attaches the AWS-managed `AWSQuickSightAthenaAccess` policy to the default QuickSight service role. |
| `aws_iam_policy.data_source_access_policy` (+ attachment) | Grants the QuickSight service role read access to the analytics bucket and write access to the `athena_query_results/*` prefix used for cached Athena results. |
| `aws_quicksight_data_source.gap_data_source` | An Athena- or Redshift-backed QuickSight data source named `game_analytics_pipeline` that points at the GAP Athena workgroup or Redshift Serverless workgroup. Grants read/pass permissions to all three GAP groups so members can build datasets on top of it. |
| `aws_quicksight_folder.gap_folder` | A shared folder named `<WORKLOAD_NAME> Samples` that holds every GAP sample asset. Folder permissions cascade to all assets inside it. |
| `aws_quicksight_group.gap_admin` | Folder Owner. Full control of the folder, its assets, and its permissions. |
| `aws_quicksight_group.gap_writer` | Folder Contributor. Can create/edit/delete assets in the folder; cannot delete the folder or change permissions. |
| `aws_quicksight_group.gap_reader` | Folder Viewer. Read-only access to all assets in the folder. |
| `local_file.bootstrap_output` | YAML file containing resource attributes for downstream samples to consume. |

### Bootstrap Output YAML

After deployment, a `bootstrap-output.yaml` file is created in the module directory containing:

```yaml
GAP_DATA_SOURCE_ARN: "arn:aws:quicksight:region:account:datasource/game-analytics-pipeline-data-source"
GAP_DATA_SOURCE_ID: "game-analytics-pipeline-data-source"
GAP_FOLDER_ID: "workload-samples"
GAP_FOLDER_ARN: "arn:aws:quicksight:region:account:folder/workload-samples"
GAP_ADMIN_GROUP_ARN: "arn:aws:quicksight:region:account:group/default/workload-admin"
GAP_ADMIN_GROUP_NAME: "workload-admin"
GAP_WRITER_GROUP_ARN: "arn:aws:quicksight:region:account:group/default/workload-writer"
GAP_WRITER_GROUP_NAME: "workload-writer"
GAP_READER_GROUP_ARN: "arn:aws:quicksight:region:account:group/default/workload-reader"
GAP_READER_GROUP_NAME: "workload-reader"
```

This file is read by downstream samples (e.g., `in-game-analysis`) to obtain the created resources.

Group action lists follow the [QuickSight folder permissions reference](https://docs.aws.amazon.com/quicksight/latest/user/sharing-folders.html). Per the [folder security model](https://docs.aws.amazon.com/quicksight/latest/user/folders-security.html), permissions on the folder cascade to every asset placed inside it, so adding a user to one of the three groups grants the matching role on every dataset, analysis, and dashboard the GAP samples create.

## Prerequisites

1. **GAP infrastructure deployed.** The pipeline's Terraform stack must already be applied so that the analytics S3 bucket and Athena workgroup exist. This module reads `infrastructure/config.yaml` for `WORKLOAD_NAME`.
2. **QuickSight initialized.** Sign in to the QuickSight console ([quicksight.aws.amazon.com](https://quicksight.aws.amazon.com/)) at least once in the target account/region and complete signup. This is what actually creates the `aws-quicksight-service-role-v0` role.
   
   > **Why this can't be automated:** `aws-quicksight-service-role-v0` (and `aws-quicksight-secretsmanager-role-v0`, for Redshift mode) are not created by any QuickSight or IAM API call — AWS only creates them the first time an administrator opens the console and accepts/selects a role on the **Manage QuickSight > Security & permissions** page. See [Passing IAM roles to QuickSight](https://docs.aws.amazon.com/quicksight/latest/user/security-create-iam-role-prerequisites.html). If you skip this step, `terraform plan` will now fail fast with a clear message instead of an opaque error deep into `apply`.
   
3. **(Redshift mode only) Secrets Manager access granted.** On the same **Security & permissions** page, under **Secrets Manager**, grant QuickSight access to the secret referenced by `REDSHIFT_SECRET_ARN`. This creates `aws-quicksight-secretsmanager-role-v0`. See [Using Secrets Manager with QuickSight](https://docs.aws.amazon.com/quicksight/latest/user/secrets-manager-integration.html).
4. **QuickSight identity region known.** QuickSight groups must be created in your QuickSight identity region (the region where your account was created). Set `QUICKSIGHT_IDENTITY_REGION` in `samples/config.yaml`. Find your identity region by checking the QuickSight console URL or running `aws quicksight describe-account-settings --aws-account-id <account-id>`.
5. **Tools.** Terraform >= 1.x and AWS credentials with permission to manage IAM and QuickSight in the target account.

## Configuration

This module reads two YAML files (no `tfvars` required):

- `samples/config.yaml` — provides values specific to the QuickSight bootstrap. Copy `samples/config.yaml.TEMPLATE` to `samples/config.yaml` and fill in:

  | Key | Description |
  | --- | --- |
  | `QUICKSIGHT_SERVICE_ROLE_ARN` | ARN of the default QuickSight service role, e.g. `arn:aws:iam::123456789012:role/service-role/aws-quicksight-service-role-v0`. |
  | `QUICKSIGHT_IDENTITY_REGION` | The region where your QuickSight account was created. Groups must be created in this region. Find it via QuickSight console URL or `aws quicksight describe-account-settings`. |
  | `QUICKSIGHT_SECRETS_MANAGER_ROLE_ARN` | (Redshift mode only) ARN of the QuickSight Secrets Manager role, e.g. `arn:aws:iam::123456789012:role/service-role/aws-quicksight-secretsmanager-role-v0`. Created when you grant QuickSight access to Secrets Manager. |
  | `ANALYTICS_BUCKET_NAME` | Name of the GAP analytics S3 bucket (output of the pipeline stack). |
  | `ATHENA_WORKGROUP_NAME` | Name of the Athena workgroup the GAP stack created. |

- `infrastructure/config.yaml` — the same config used to deploy the pipeline. Only `WORKLOAD_NAME` is consumed here, used to name the folder and groups.

The AWS region is set in `providers.tf` (defaults to `us-east-1`). QuickSight groups are created in the identity region specified by `QUICKSIGHT_IDENTITY_REGION` in `samples/config.yaml`.

## 1) Predeployment

1. **Initialize QuickSight** - Sign in to the QuickSight console at least once and complete signup. This creates the required service role (`aws-quicksight-service-role-v0`).
2. **(Redshift mode only)** On **Manage QuickSight > Security & permissions > Secrets Manager**, grant QuickSight access to your Redshift secret. This creates `aws-quicksight-secretsmanager-role-v0`.
3. **Find your QuickSight identity region** by checking the QuickSight console URL or running `aws quicksight describe-account-settings --aws-account-id <account-id>`.
4. Confirm the GAP pipeline is deployed and capture:
   - the analytics bucket name
   - the Athena workgroup name
5. Create `samples/config.yaml` from the template and populate the values, including `QUICKSIGHT_IDENTITY_REGION` and (for Redshift mode) `QUICKSIGHT_SECRETS_MANAGER_ROLE_ARN`.

If you skip steps 1-2, `terraform plan` fails immediately with a clear error naming the missing role and what to do, instead of failing deep into `terraform apply` with QuickSight's generic "service role required to access your AWS resources has not been created yet" message.

## 2) Deployment

```bash
cd samples/quicksuite-bootstrap

terraform init
terraform plan
terraform apply
```

Apply takes well under a minute. After it completes, QuickSight will have:

- A working Athena data source pointed at the GAP workgroup.
- A `<WORKLOAD_NAME> Samples` shared folder.
- Three groups (`<workload>-admin`, `<workload>-writer`, `<workload>-reader`) with the corresponding folder permission tiers.

## 3) Postdeployment

### Add users to the appropriate group

Decide which role each user should have, then add them with `aws_quicksight_group_membership` or via the AWS CLI:

```bash
aws quicksight create-group-membership \
  --aws-account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --namespace default \
  --group-name <workload>-reader \
  --member-name <quicksight-username>
```

Group membership takes effect immediately. Because folder permissions cascade, new members automatically gain the matching access on every asset inside the folder.

### Place sample assets in the folder

When other GAP sample modules create datasets, analyses, or dashboards, add them to `aws_quicksight_folder.gap_folder` using `aws_quicksight_folder_membership`. As soon as an asset is added, the three groups inherit owner/contributor/viewer access to it.

### Verify

- In QuickSight, navigate to **Datasets → New dataset → Athena** and confirm `game_analytics_pipeline` is selectable.
- Open **Folders → Shared folders** and verify `<WORKLOAD_NAME> Samples` appears with three principals listed in **Share**.

## File layout

```
samples/quicksuite-bootstrap/
├── main.tf                  # All resources (IAM + data source + folder + groups)
├── providers.tf             # AWS provider + region
├── outputs.tf               # (Optional outputs - currently empty)
├── quicksuite-construct.ts  # Original CDK construct (kept for reference)
└── README.md                # This file
```

## Cleanup

```bash
terraform destroy
```

Note that QuickSight folders must be empty before they can be deleted. If samples have already been added to the folder, remove them (or their `aws_quicksight_folder_membership` resources) first.

## References

- [QuickSight folder permissions reference](https://docs.aws.amazon.com/quicksight/latest/user/sharing-folders.html)
- [Folder security model (cascading permissions)](https://docs.aws.amazon.com/quicksight/latest/user/folders-security.html)
- [`aws_quicksight_data_source` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_data_source)
- [`aws_quicksight_folder` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_folder)
- [`aws_quicksight_group` resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/quicksight_group)
