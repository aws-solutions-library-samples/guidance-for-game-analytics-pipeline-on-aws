## Root File Structure

This page highlights key components of the file hierarchy when navigating the guidance. It may not include extraneous files for doc clarity.

```
root/
├─ docs/
├─ business-logic/
├─ infrastructure/
├─ package.json
```

- **Docs**
    - This folder holds all the files for this documentation site (mkdocs)

- **Business Logic**
    - This folder holds all of the "business logic", non-infrastructure files, such as:
        - Source scripts and files for Lambda, Glue, Opensearch, API Gateway, Flink to be used for deployment
        - Sample data event generator scripts

- **Infrastructure**
    - This folder holds all Infrastructure-as-Code (IaC) deployment files for the guidance. Can choose between AWS CDK and Terraform

- **Package.json**
    - Has config option for deploying in CDK or Terraform ("config": "iac": "cdk" | "tf") and all build commands. See [Getting Started](../getting-started.md) for more details

## Business Logic Folder Deep Dive

```
business-logic/
├─ api/
│  ├─ admin/
│  ├─ api-definitions/
│  ├─ lambda-authorizer/
├─ data-lake/
│  ├─ glue-scripts/
├─ events-processing/
├─ flink-event-processing/
├─ opensearch-ingestion/
├─ publish-data/
```

- **api**
    - This folder holds the business logic for the API backend:
        - `admin/` holds all of the API serverless backend logic on AWS Lambda
        - `api-definitions/` holds OpenAPI templates that represent the API calls. Is either a reference for CDK, or directly used as template for deployment for Terraform.
        - `lambda-authorizer/` holds the Lambda code for the component in API Gateway that authorizes API calls before they pass through. See [Component Deep Dive](../component-deep-dive.md) for more details

- **data-lake**
    - This folder holds all of the ETL scripts that Glue runs as jobs, such as conversion jobs from one format to another, or processing jobs that optimize formats, partition, and send from raw to processed events. The guidance comes with skeleton sample scripts that have inherited best practices, but no direct transformations on the data, since those are customized by you for your use cases

- **events-processing**
    - Only used during `Data Lake` mode, Amazon Data Firehose will use the logic in here in an integrated Lambda feature for in-flight data sanitation and ETL option, akin to a "pre-processing" option for customers. See [Component Deep Dive](../component-deep-dive.md) for details on the pre-processing performed by default. This is different than the ETL processing jobs ran by Glue, which are preferable for cost reasons if data could be processed after ingestion to the S3 data lake, but for business/technical requirements that require processing as part of ingestion, the logic here can be modified

- **flink-event-processing**
    - Only used if `Real Time Analytics` is enabled, this folder holds the business logic used by Amazon Managed Service for Apache Flink for real-time processing of events. The sample application code uses Apache Maven and by default has sample transformations based on sample data sent by the `publish-data` script (see below)

- **opensearch-ingestion**
    - Only used if `Real Time Analytics` is enabled, this folder holds the template files used by Amazon Managed Opensearch Service during deployment

- **publish-data**
    - Has a sample data event generator script on Python that simulates generic game events. The sample Athena queries and Flink sample code are tied to these sample game events, so they will need to be tailored to meet your specific event data

## Infrastructure Folder Deep Dive

```
infrastructure/
├─ aws-cdk/
│  ├─ src/
├─ terraform/
│  ├─ src/
├─ config.yaml.TEMPLATE
```

- **aws-cdk / terraform**
    - Holds the IaC template code for the respective tool, main source files are in `/src`

- **config.yaml.TEMPLATE**
    - Sample template file for settings/configurations for your deployment, which would be copied into `config.yaml`. See [Getting Started](../getting-started.md) for setting up the config file and deployment.


## CDK Folder Deep Dive

```
src/
├─ constructs/
│  ├─ samples/
├─ helpers/
├─ app-stack.ts
├─ app.ts
```

## Terraform Folder Deep Dive

```
├─ src/
├─ constructs/
│  ├─ samples/
├─ main.tf
```

- **constructs**
    - Holds all infrastructure template components for the guidance, but broken down into logical parts called constructs. See below for references for each construct.

- **(cdk only) app.ts**
    - Contains variable validation and top-level deployment dependencies specific to CDK / Typescript

## Construct Reference

- **main construct (app-stack.ts / main.tf)**
    - Root template file that connects all constructs together along with deploying central components that have dependencies across multiple constructs (Logs + Analytics S3 buckets, DynamoDB tables, SNS Encryption key + IAM policies)

- **api-construct**
    - Deploys API backend related infrastructure, such as API Gateway and IAM roles

---

- **dashboard-construct**
    - Deploys the operational real-time CloudWatch dashboard components, such as the dashboard, widgets, and metrics

---

- **data-lake-construct**
    - Deploys `Data Lake Mode` components, such as Glue Database, Glue Tables (Iceberg or Hive), and Athena workgroup

---

- **data-processing-construct**
    - Deploys `Data Lake Mode` components specifically to ETL processing, such as Glue Workflow, Glue Crawler + Trigger, and Glue ETL Jobs + IAM Roles

---

- **flink-construct**
    - Deploys `Real Time Mode` component for Managed Service for Apache Flink, such as the Flink Application + IAM Roles and Flink Log Groups

---

- **lambda-construct**
    - Deploys all Lambda function components across the guidance, such as `Data Lake Mode` event processing (Firehose), API Authorizer, API Backend (Admin Service, Redshift deployment service), and corresponding Lambda IAM Roles

---

- **metrics-construct**
    - Deploys Cloudwatch Alarms such as Kinesis Data Streams alarms if those components are enabled, `Data Lake Mode` Lambda error alarms, `Data Lake Mode` Firehose alarms, DynamoDB error alarms, and API Gateway error alarms.

---

- **opensearch-construct**
    - Deploys Opensearch components such as the serverless cluster, ingestion dead letter queue, encryption, IAM roles, and dashboard 

---

- **redshift-construct**
    - Deploys `Redshift Mode` components such as Serverless Redshift cluster, encryption, IAM Roles, Security Group added to VPC Construct's networking components

---

- **streaming-ingestion-construct**
    - Deploys `Data Lake Mode` Firehose components + IAM role + Log Groups for Iceberg and Hive

---

- **vpc-construct**
    - Deploys bare-bones VPC components for `Redshift Mode` or `Real Time : Enabled` which have dependencies

---

- **samples/athena-construct**
    - Deploys sample Athena queries in a nested `samples` folder, which are entirely dependent on the sample event code and is subject to greatest adjustment when implementing your own custom events