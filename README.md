# Game Analytics Pipeline on AWS

>[!IMPORTANT] 
>This Guidance requires the use of AWS [CodeCommit](https://docs.aws.amazon.com/codecommit/latest/userguide/welcome.html), which is no longer available to new customers. Existing customers of AWS CodeCommit can continue using and deploying this Guidance as normal.

## Table of Contents

List the top-level sections of the README template, along with a hyperlink to the specific section.

1. [Overview](#overview)
    - [Cost](#cost)
2. [Prerequisites](#prerequisites)
    - [Operating System](#operating-system)
3. Deployment Steps, Running the Guidance, and Deployment Validation
4. [Next Steps](#next-steps)
5. [Notices](#notices)
6. [Authors](#authors)

## Overview

The games industry is increasing adoption of the Games-as-a-Service operating model, where games have become more like a service than a product, and recurring revenue is frequently generated through in-app purchases, subscriptions, and other techniques. With this change, it is critical to develop a deeper understanding of how players use the features of games and related services. This understanding allows game developers to continually adapt, and make the necessary changes to keep players engaged.

The Game Analytics Pipeline guidance helps game developers to apply a flexible, and scalable DataOps methodology to their games. Allowing them to continuously integrate, and continuously deploy (CI/CD) a scalable serverless data pipeline for ingesting, storing, and analyzing telemetry data generated from games, and services. The guidance supports streaming ingestion of data, allowing users to gain critical insights from their games, and other applications in near real-time, allowing them to focus on expanding, and improving game experience almost immediately, instead of managing the underlying infrastructure operations. Since the guidance has been codified as a CDK application, game developers can determine the best modules, or components that fit their use case, allowing them to test, and QA the best architecture before deploying into production. This modular system allows for additional AWS capabilities, such as AI/ML models, to be integrated into the architecture in order to further support real-time decision making, and automated LiveOps using AIOps, to further enhance player engagement. Essentially allowing developers to focus on expanding game functionality, rather than managing the underlying infrastructure operations.

### Cost

NOTE: The cost breakdown does not include CloudWatch

_You are responsible for the cost of the AWS services used while running this Guidance. As of August 2025, the cost for running this Guidance with the default settings in the US East (N. Virginia) region is approximately:_
- $58.20 per month for Data Lake Mode w/ Firehose Batching
- $107.16 per month for Data Lake Mode w/ Kinesis Data Streams
- Between $200.40 (4 hour runtime) - $1115.40 (24 hour runtime) per month for Redshift Mode assuming 4 RPU
- + $<575.93> (or $<526.97> if already using Kinesis Data Streams) per month if real-time is enabled

Note: Redshift becomes more cost-effective when scanning large data volumes per query (>10GB data scanned for a single query) coupled with frequent queries

Assuming the following variables:
- Processing 259.2 million events per month = 100 events per second
- Requests batched by 100 (100kb batched) per API request = 2,592,000 requests (1 request per second)
- 100 queries per day scanning 100mb avg each 2DPU 2 minute ETL jobs (If using Data Lake)
- 0.01GB of entries in DynamoDB
- 259GB data (259 million 1kb entries)

_We recommend creating a [Budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) through [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) to help manage costs. Prices are subject to change. For full details, refer to the pricing webpage for each AWS service used in this Guidance._

### Sample Cost Table

The following table provides a sample cost breakdown for components in the guidance in the US East (N. Virginia) Region for one month.

API Component
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon API Gateway | 2,592,000 REST API calls per month | $ 9.07/month |
| AWS Lambda | Authorizer Lambda 2,592,000 calls per month | $ 0.32/month |
| Amazon DynamoDB | 0.01GB entries for admin use | $ 0.00/month |

Kinesis Data Stream Ingest
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Kinesis Data Streams | 259,200,000 requests | $ 48.96/month |

Data Lake Mode / PUT Batch
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Data Firehose | 259,200,000 requests | $ 40.80/month |
| AWS Lambda | Events Processing Lambda 2,592,000 calls per month | $ 0.32/month |
| Amazon Simple Storage Service (S3) | 256GB data | $ 6.09/month |
| AWS Glue | 2DPU 2 min ETL Jobs | $ 0.15/month |
| Amazon Athena | 100 queries per day scanning 100mb data avg | $ 1.45/month |

Amazon Redshift Serverless
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Redshift Serverless | 4 RPU 4 hour / day | $ 183.00/month |

Real-Time Analytics

| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Managed Service for Apache Flink | 1 KPU | $ 165.60/month |
| Amazon Kinesis Data Streams | 1MBps/ Metric Output Stream | $ 10.95/month |
| Amazon OpenSearch Service (Serverless) | 1 OCU Index + Search/Query + 1GB Index | $ 350.42/month |

## Prerequisites

Before deploying the sample code, ensure that the following required tools have been installed:

- **[GitHub Account](https://docs.github.com/en/get-started/start-your-journey/creating-an-account-on-github)**
- **[Visual Studio Code](https://code.visualstudio.com/Download)**
- **[Docker Desktop (local)](https://www.docker.com/products/docker-desktop/)**
- **[Apache Maven](https://maven.apache.org/download.cgi)**
- **AWS Cloud Development Kit (CDK) 2.92**
- **Python >=3.8**
- **NodeJS >= 20.0.0**

>__NOTE:__ A Visual Studio Code [dev container](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers) configuration has been provided for you. This image container the necessary *Python*, *NodeJS*, and the *AWS CDK* versions needed to implement this guidance. It is **recommended**, that you use the pre-configured [environment](https://code.visualstudio.com/docs/devcontainers/containers) as your development environment.  

### Operating System

These deployment instructions are optimized to best work on **Windows or MacOS**.  Deployment in another OS may require additional steps

### Third-party tools

Python/pip, Npm/node, and (optionally) Terraform

## Deployment Steps, Running the Guidance, and Deployment Validation

Refer to the full documentation through `pip install mkdocs mkdocs-material` and `mkdocs serve` or in `docs/getting-started.md` for running the guidance. The page provides full detailed walkthrough and deployment steps.

## Next Steps

Refer to the documentation through `pip install mkdocs mkdocs-material` and `mkdocs serve` or in `docs/customizations.md` for next steps and customizations


## Cleanup

- `npm run destroy`
- Guidance requires manual deletion of S3 buckets, DyanmoDB tables, and if enabled, Redshift and OpenSearch.

## Notices

Customers are responsible for making their own independent assessment of the information in this Guidance. This Guidance: (a) is for informational purposes only, (b) represents AWS current product offerings and practices, which are subject to change without notice, and (c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided “as is” without warranties, representations, or conditions of any kind, whether express or implied. AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this Guidance is not part of, nor does it modify, any agreement between AWS and its customers.

## Authors

Daniel Lee, Nathan Yee, Matthew Kwan, Christian Orellana, Rene Roldan, and Steve Parker

Special thanks to Narendra Gupta and Satesh Sonti
