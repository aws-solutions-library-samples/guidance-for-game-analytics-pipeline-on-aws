# QuickSight Analytics Dashboard (Manual Setup)

This guide walks through deploying the Amazon QuickSight analytics dashboard for the Game Analytics Pipeline by hand, using the AWS CLI and the QuickSight console.

!!! Note
An earlier iteration of this guidance automated this entire setup with a CDK construct and an admin-Lambda teardown routine. That path is not part of this release; every step below is a manual replacement for what the construct used to do at `cdk deploy` / `cdk destroy` time.

The dashboard connects to an **Amazon Redshift Serverless** workgroup and visualizes six datasets built directly from your `event_data` table. The dataset SQL templates that ship with this guide use Redshift-specific syntax (the SUPER `events.payload...` path, `::VARCHAR`/`::BIGINT` casts, and `date_trunc`), so this guide is scoped to Redshift Serverless only.

---

## 1. Prerequisites

- An active **Amazon QuickSight Enterprise** subscription in the target AWS account and Region. QuickSight Standard does not support the API calls used in this guide.
- A registered QuickSight user or group to grant dashboard access to (console: **QuickSight > Manage QuickSight > Manage users**).
- The Game Analytics Pipeline data stack already deployed in **Redshift mode** and receiving events: the Redshift Serverless workgroup is `ACTIVE` and `POST /redshift/setup` has been called at least once, so the `event_data` materialized view exists in the `public` schema. The six dataset templates in this guide query that `event_data` materialized view directly (via its SUPER `payload` column); they do **not** depend on the additional reporting views that `POST /redshift/setup` also creates. See the [Start initial Application and API section of the Getting Started guide](getting-started.md#start-initial-application-and-api) (and the [API Reference for POST - Set up Redshift](references/api-reference.md#post-set-up-redshift)) for how to invoke that call.
- The AWS CLI v2, configured with credentials that can call `quicksight:*`, `iam:*`, and `secretsmanager:GetSecretValue` in the target account.

!!! Info "Cost"
QuickSight Enterprise is billed separately from the rest of the pipeline: roughly **$18.00/month per author** and **$250.00/month minimum per session capacity unit** (readers at $0.30 per 30-minute session). See the [Amazon QuickSight pricing page](https://aws.amazon.com/quicksight/pricing/) and the repository's [README cost table](https://github.com/aws-solutions-library-samples/guidance-for-game-analytics-pipeline-on-aws#cost) for the full breakdown.

---

## 2. IAM: create the QuickSight service role

QuickSight needs permission to read from your Redshift Serverless workgroup. Two pieces of IAM are involved:

1. A dedicated service role, assumed by QuickSight, used as the execution role for the VPC connection.
2. An inline policy attached to the AWS-managed QuickSight service role (`aws-quicksight-service-role-v0`), which is what QuickSight actually assumes when it runs a query.

Create the trust policy and role:

```bash
cat > trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "quicksight.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name <WORKLOAD_NAME>-qs-role \
  --assume-role-policy-document file://trust-policy.json
```

Attach Secrets Manager, KMS, and Redshift Serverless permissions:

```bash
cat > qs-redshift-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "<REDSHIFT_SECRET_ARN>"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "<REDSHIFT_KMS_KEY_ARN>"
    },
    {
      "Effect": "Allow",
      "Action": ["redshift-serverless:GetCredentials", "redshift-serverless:GetWorkgroup"],
      "Resource": "arn:aws:redshift-serverless:<REGION>:<AWS_ACCOUNT_ID>:workgroup/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateNetworkInterface",
        "ec2:ModifyNetworkInterfaceAttribute",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name <WORKLOAD_NAME>-qs-role \
  --policy-name <WORKLOAD_NAME>-qs-redshift-inline \
  --policy-document file://qs-redshift-policy.json

aws iam put-role-policy \
  --role-name aws-quicksight-service-role-v0 \
  --policy-name <WORKLOAD_NAME>-QuickSightSecretAccess \
  --policy-document file://qs-redshift-policy.json
```

Where to find the two ARN placeholders above:

- `<REDSHIFT_SECRET_ARN>` — the admin secret created for the workgroup. Its name is `redshift!<WORKLOAD_NAME>-workspace-db-admin`; get the full ARN (with the trailing random suffix) with:

    ```bash
    aws secretsmanager list-secrets \
      --query "SecretList[?starts_with(Name, 'redshift!<WORKLOAD_NAME>-workspace-db-admin')].ARN" --output text
    ```

- `<REDSHIFT_KMS_KEY_ARN>` — the KMS key that encrypts that secret. Read it straight off the secret:

    ```bash
    aws secretsmanager describe-secret \
      --secret-id <REDSHIFT_SECRET_ARN> --query 'KmsKeyId' --output text
    ```

The `ec2:*NetworkInterface*` / `ec2:Describe*` statement is required: QuickSight validates the execution role when the VPC connection is created and rejects any role that cannot manage the connection's elastic network interfaces, so `create-vpc-connection` fails with `Provided role is invalid` without it.

QuickSight also needs a security group and a QuickSight VPC connection so it can reach the Redshift Serverless workgroup over the private subnets. Create the security group in the same VPC as the workgroup, then create the VPC connection. The workgroup exposes its subnets and security group here:

```bash
aws redshift-serverless get-workgroup \
  --workgroup-name <WORKLOAD_NAME>-workgroup \
  --query 'workgroup.{subnets:subnetIds,securityGroups:securityGroupIds}'

# Create an egress-only security group in the workgroup's VPC (derive <VPC_ID>
# from one of the subnets above via: aws ec2 describe-subnets --subnet-ids <SUBNET_ID>).
# A new security group already allows all outbound traffic, so no extra egress rule is needed.
aws ec2 create-security-group \
  --group-name <WORKLOAD_NAME>-QuickSight-SG \
  --description "QuickSight VPC connection SG" \
  --vpc-id <VPC_ID> --query 'GroupId' --output text
```

The workgroup's own security group must allow inbound on the Redshift port (see the port note in step 3) from within the VPC; the security group created by this guidance already does (it allows the VPC CIDR), so the QuickSight ENIs placed in those subnets can reach it. Then create the VPC connection:

```bash
aws quicksight create-vpc-connection \
  --aws-account-id <AWS_ACCOUNT_ID> \
  --vpc-connection-id <VPC_CONNECTION_ID> \
  --name "<WORKLOAD_NAME>-QuickSight-VPC" \
  --role-arn "arn:aws:iam::<AWS_ACCOUNT_ID>:role/<WORKLOAD_NAME>-qs-role" \
  --subnet-ids "<PRIVATE_SUBNET_ID_1>" "<PRIVATE_SUBNET_ID_2>" \
  --security-group-ids "<SECURITY_GROUP_ID>"
```

If `create-vpc-connection` still returns `InvalidParameterValueException: Provided role is invalid` after the role above is in place, see the troubleshooting section at the end of this guide — some caller identities hit this error from the CLI even with a correct role, and the QuickSight console path works instead.

Wait for the connection to finish provisioning before continuing. `describe-vpc-connection` returns two separate fields: the lifecycle field `Status` (which progresses `CREATION_IN_PROGRESS` → `CREATION_SUCCESSFUL`, **not** `AVAILABLE`) and a separate reachability field `AvailabilityStatus` (which becomes `AVAILABLE`). Wait until `Status` is `CREATION_SUCCESSFUL` **and** `AvailabilityStatus` is `AVAILABLE`:

```bash
aws quicksight describe-vpc-connection \
  --aws-account-id <AWS_ACCOUNT_ID> \
  --vpc-connection-id <VPC_CONNECTION_ID> \
  --query 'VPCConnection.{Status:Status,AvailabilityStatus:AvailabilityStatus}'
```

Do not poll for `Status: AVAILABLE` — that value never appears on the `Status` field and the loop will never terminate.

---

## 3. Create the data source

Do **not** put the Redshift admin password inline on the command line — it would leak into shell history and the process argument list. Instead, pull it from Secrets Manager into a temporary, owner-only (`chmod 600`) JSON file, pass it with `--credentials file://`, and delete the file immediately afterward:

```bash
# Build a chmod-600 credentials file from Secrets Manager; never inline the password.
CREDS_FILE="$(mktemp)"
chmod 600 "$CREDS_FILE"
trap 'rm -f "$CREDS_FILE"' EXIT

REDSHIFT_PASSWORD="$(aws secretsmanager get-secret-value \
  --secret-id <REDSHIFT_SECRET_ARN> \
  --query 'SecretString' --output text \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["password"])')"

cat > "$CREDS_FILE" <<EOF
{"CredentialPair":{"Username":"db-admin","Password":"${REDSHIFT_PASSWORD}"}}
EOF
unset REDSHIFT_PASSWORD

aws quicksight create-data-source \
  --aws-account-id <AWS_ACCOUNT_ID> \
  --data-source-id <WORKLOAD_NAME>-redshift-ds \
  --name "<WORKLOAD_NAME>-Redshift" \
  --type REDSHIFT \
  --data-source-parameters '{"RedshiftParameters":{"Database":"<EVENTS_DATABASE>","Host":"<REDSHIFT_HOST>","Port":<REDSHIFT_PORT>}}' \
  --credentials "file://${CREDS_FILE}" \
  --vpc-connection-properties '{"VpcConnectionArn":"arn:aws:quicksight:<REGION>:<AWS_ACCOUNT_ID>:vpcConnection/<VPC_CONNECTION_ID>"}' \
  --permissions Principal=<QUICKSIGHT_PRINCIPAL_ARN>,Actions=quicksight:DescribeDataSource,quicksight:DescribeDataSourcePermissions,quicksight:PassDataSource,quicksight:UpdateDataSource,quicksight:DeleteDataSource,quicksight:UpdateDataSourcePermissions

# Remove the credentials file as soon as the call returns.
rm -f "$CREDS_FILE"
trap - EXIT
```

`<EVENTS_DATABASE>` is the `EVENTS_DATABASE` value from `config.yaml` (the same token used in step 4).

!!! Warning "Host and port come from the workgroup endpoint — do not assume port 5439"
    Get `<REDSHIFT_HOST>` and `<REDSHIFT_PORT>` from the workgroup endpoint, not from Redshift defaults. Redshift Serverless workgroups created by this guidance listen on port **5431**, not the provisioned-Redshift default of 5439, and using the wrong port makes `create-data-source` succeed but leaves the connection unusable. Read the real values with:

    ```bash
    aws redshift-serverless get-workgroup \
      --workgroup-name <WORKLOAD_NAME>-workgroup \
      --query 'workgroup.endpoint.{Host:address,Port:port}'
    ```

Confirm the data source connected before moving on — wait until `Status` is `CREATION_SUCCESSFUL` (a `CREATION_FAILED` here almost always means the VPC connection cannot reach the workgroup on the port above, or the credentials/secret are wrong):

```bash
aws quicksight describe-data-source \
  --aws-account-id <AWS_ACCOUNT_ID> \
  --data-source-id <WORKLOAD_NAME>-redshift-ds \
  --query 'DataSource.{Status:Status,Error:ErrorInfo}'
```

Note the `Arn` from the response, you need it as `<DATA_SOURCE_ARN>` in the next step.

---

## 4. Create the six datasets

Dataset definitions are provided in this repository's `resources/quicksight/datasets/<datasetName>.json` (one file per dataset). Each JSON file is already shaped for `create-data-set --cli-input-json` and carries its own inline `CustomSql` that reads directly from the `event_data` materialized view — these are QuickSight dataset queries, not the Redshift reporting views created by `POST /redshift/setup`. Before running the commands, replace all five placeholders in every dataset file:

- `<DATA_SOURCE_ARN>` — the data source ARN from step 3.
- `<EVENTS_DATABASE>` — the name of the Redshift database that holds the `event_data` materialized view (the same database name configured for the Redshift Serverless workgroup, i.e. `EVENTS_DATABASE` in `config.yaml`). The dataset SQL reads `FROM "<EVENTS_DATABASE>"."public"."event_data"`, so this must match your deployed database.
- `<AWS_ACCOUNT_ID>` — your AWS account ID.
- `<WORKLOAD_NAME>` — the workload name from `config.yaml` (also the prefix of each `DataSetId`).
- `<QUICKSIGHT_PRINCIPAL_ARN>` — the QuickSight user ARN the dataset permissions are granted to (same value used in step 3).

The six datasets are: `all_events`, `match_events`, `level_events`, `economy_events`, `player_health`, and `match_lifecycle_funnel`. Each is a QuickSight dataset backed by its own SQL against `event_data`; they are unrelated to the Redshift reporting views (`total_events`, `level_completion_rate`, `average_sentiment_per_day`, and so on) that `POST /redshift/setup` creates for ad-hoc querying in the Redshift console.

```bash
for view in all_events match_events level_events economy_events player_health match_lifecycle_funnel; do
  aws quicksight create-data-set \
    --cli-input-json file://resources/quicksight/datasets/${view}.json
done
```

Record each dataset's `Arn` from the `create-data-set` response (or via `describe-data-set`) — these are the `<DATASET_ARN_all_events>`, `<DATASET_ARN_match_events>`, `<DATASET_ARN_level_events>`, `<DATASET_ARN_economy_events>`, `<DATASET_ARN_player_health>`, and `<DATASET_ARN_match_lifecycle_funnel>` values referenced by the dashboard definition in the next step.

---

## 5. Create the dashboard

The dashboard layout (five sheets — Pulse, Progression, Combat, Monetization, Sentiment — plus shared null-exclusion filters) is provided in this repository's `resources/quicksight/dashboard-definition.json`. Fill in the six dataset ARNs from step 4 and your principal ARN, then create the dashboard:

```bash
aws quicksight create-dashboard \
  --aws-account-id <AWS_ACCOUNT_ID> \
  --dashboard-id <WORKLOAD_NAME>-game-dashboard \
  --name "<WORKLOAD_NAME>-Game-Analytics" \
  --cli-input-json file://resources/quicksight/dashboard-definition.json
```

Confirm it published successfully:

```bash
aws quicksight describe-dashboard \
  --aws-account-id <AWS_ACCOUNT_ID> \
  --dashboard-id <WORKLOAD_NAME>-game-dashboard
```

The dashboard URL follows the pattern `https://<REGION>.quicksight.aws.amazon.com/sn/dashboards/<WORKLOAD_NAME>-game-dashboard`.

---

## 6. Permissions and sharing

The dashboard, datasets, and data source are all created with a `--permissions` block scoped to a single `<QUICKSIGHT_PRINCIPAL_ARN>` (the ARN form of `<QUICKSIGHT_USERNAME>`: `arn:aws:quicksight:<REGION>:<AWS_ACCOUNT_ID>:user/default/<QUICKSIGHT_USERNAME>`). To share with additional users or groups, either:

- Use the QuickSight console: open the dashboard, choose **Share**, and add users or groups directly, or
- Grant access from the CLI for each additional principal:

```bash
aws quicksight update-dashboard-permissions \
  --aws-account-id <AWS_ACCOUNT_ID> \
  --dashboard-id <WORKLOAD_NAME>-game-dashboard \
  --grant-permissions Principal=<QUICKSIGHT_PRINCIPAL_ARN>,Actions=quicksight:DescribeDashboard,quicksight:ListDashboardVersions,quicksight:QueryDashboard,quicksight:UpdateDashboard,quicksight:DeleteDashboard,quicksight:UpdateDashboardPermissions,quicksight:DescribeDashboardPermissions
```

Repeat with the equivalent `update-data-set-permissions` / `update-data-source-permissions` calls for each dataset and the data source if the additional user also needs direct dataset access outside the dashboard.

---

## 7. Teardown

Delete resources in dependency order, the reverse of how they were created. This replaces what the admin-Lambda teardown routine used to do automatically on `cdk destroy`.

1. **Dashboard**

   ```bash
   aws quicksight delete-dashboard \
     --aws-account-id <AWS_ACCOUNT_ID> \
     --dashboard-id <WORKLOAD_NAME>-game-dashboard
   ```

2. **Datasets** (all six)

   ```bash
   for view in all_events match_events level_events economy_events player_health match_lifecycle_funnel; do
     aws quicksight delete-data-set \
       --aws-account-id <AWS_ACCOUNT_ID> \
       --data-set-id <WORKLOAD_NAME>-${view}
   done
   ```

3. **Data source**: delete the Redshift data source. This **must** happen before the VPC connection step, because the data source references the connection and `delete-vpc-connection` fails while that reference exists.

   ```bash
   aws quicksight delete-data-source \
     --aws-account-id <AWS_ACCOUNT_ID> \
     --data-source-id <WORKLOAD_NAME>-redshift-ds
   ```

4. **VPC connection** — delete, then poll until it reports `DELETED` before touching IAM:

   ```bash
   aws quicksight delete-vpc-connection \
     --aws-account-id <AWS_ACCOUNT_ID> \
     --vpc-connection-id <VPC_CONNECTION_ID>

   aws quicksight describe-vpc-connection \
     --aws-account-id <AWS_ACCOUNT_ID> \
     --vpc-connection-id <VPC_CONNECTION_ID>
   ```

   The underlying elastic network interfaces take a few minutes to release. Re-run `describe-vpc-connection` every 30-60 seconds until `VPCConnection.Status` is `DELETED` (see the retry note below if it reports `DELETION_IN_PROGRESS`).

5. **IAM role and its inline policies**: remove the inline policy from the shared QuickSight service role first (do **not** delete `aws-quicksight-service-role-v0` itself, other QuickSight resources in the account may still depend on it), then clean up and delete the dedicated role.

   ```bash
   aws iam delete-role-policy \
     --role-name aws-quicksight-service-role-v0 \
     --policy-name <WORKLOAD_NAME>-QuickSightSecretAccess
   ```

   Then remove the dedicated role's inline policy and delete the role:

   ```bash
   aws iam delete-role-policy \
     --role-name <WORKLOAD_NAME>-qs-role \
     --policy-name <WORKLOAD_NAME>-qs-redshift-inline

   aws iam list-role-policies --role-name <WORKLOAD_NAME>-qs-role
   aws iam list-attached-role-policies --role-name <WORKLOAD_NAME>-qs-role
   # delete/detach anything the two list calls return, then:
   aws iam delete-role --role-name <WORKLOAD_NAME>-qs-role
   ```

6. **Security group**: delete the security group created for the VPC connection in step 2. This must wait until the VPC connection reports `DELETED` (step 4), because the connection's network interfaces reference the group until they are released.

   ```bash
   aws ec2 delete-security-group --group-id <SECURITY_GROUP_ID>
   ```

Manually deleting the underlying Redshift Serverless workgroup, its secret, or the S3 analytics bucket is out of scope for this guide — teardown steps for the data stack itself live in the repository's [README Cleanup section](https://github.com/aws-solutions-library-samples/guidance-for-game-analytics-pipeline-on-aws#cleanup).

---

## 8. Troubleshooting

**`create-vpc-connection` fails with `InvalidParameterValueException: Provided role is invalid`**

First confirm the execution role has the trust policy for `quicksight.amazonaws.com` **and** the `ec2:*NetworkInterface*` / `ec2:Describe*` statement from step 2 — a role without those EC2 permissions is always rejected with this exact message. If the role is correct and the error persists, the cause is usually the calling identity rather than the role: some caller types (for example plain IAM users in accounts where QuickSight uses identity-pool authentication) are rejected by the API with this same misleading message. Create the connection from the QuickSight console instead (**Manage QuickSight > Manage VPC connections > Add VPC connection**) using the same role, subnets, and security group — the console path accepts the identical configuration. Also note that IAM changes can take a minute or two to propagate; retry once before switching to the console.

**`ConflictException` / VPC connection stuck in `DELETION_IN_PROGRESS`**

`delete-vpc-connection` is asynchronous. If a second `delete-vpc-connection` call (or the IAM cleanup in step 5) fails because the connection is still `DELETION_IN_PROGRESS`, wait a few minutes and re-run `describe-vpc-connection`. This is idempotent, calling `delete-vpc-connection` again on an already-deleting or already-deleted connection returns `ResourceNotFoundException` or a `ConflictException` mentioning it is already deleted, both of which are safe to treat as success. If the status becomes `DELETION_FAILED`, check the QuickSight console for stuck ENIs before retrying.

**`create-dashboard` fails with a dataset-identifier mismatch**

The `dashboard-definition.json` template references datasets by ARN via `DataSetIdentifierDeclarations`. Confirm every `<DATASET_ARN_*>` placeholder in the file was replaced with the real ARN from step 4, and that all six datasets exist in the same account/Region as the dashboard.

**Dashboard loads with empty visuals**

This is expected until the underlying SQL views have data. Confirm `POST /redshift/setup` has run at least once and that the Redshift Serverless workgroup is `ACTIVE` and reachable through the QuickSight VPC connection.

**`create-data-set` fails with a relation-not-found or database error**

Confirm the `<EVENTS_DATABASE>` placeholder in each `resources/quicksight/datasets/<viewName>.json` file was replaced with the actual Redshift database name and that the `public.event_data` table (and the SQL views) exist in that database.
