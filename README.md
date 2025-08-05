# Game Analytics Pipeline on AWS

## Table of Contents

1. [Overview](#overview)
    - [Cost](#cost)
2. [Prerequisites](#prerequisites)
    - [Operating System](#operating-system)
3. [Deployment Steps, Running the Guidance, and Deployment Validation](#deployment-steps-running-the-guidance-and-deployment-validation)
4. [Next Steps](#next-steps)
5. [Notices](#notices)
6. [Authors](#authors)

## Overview

The games industry is increasing adoption of the Games-as-a-Service operating model, where games have become more like a service than a product, and recurring revenue is frequently generated through in-app purchases, subscriptions, and other techniques. With this change, it is critical to develop a deeper understanding of how players use the features of games and related services. This understanding allows game developers to continually adapt, and make the necessary changes to keep players engaged.

![Architecture](./docs/media/architecture.png)

The Game Analytics Pipeline guidance helps game developers deploy a scalable serverless data pipeline for ingesting, storing, and analyzing telemetry data generated from games, and services. The guidance supports streaming ingestion of data, allowing users to gain critical insights from their games, and other applications in near real-time, allowing them to focus on expanding, and improving game experience almost immediately, instead of managing the underlying infrastructure operations. 

The guidance has been codified as a modular CDK or Terraform application, enabling game developers to determine the best modules that fit their use case. This modular system allows for additional AWS capabilities, such as AI/ML models, to be integrated into the architecture to further support real-time decision making and automated LiveOps using AIOps to further enhance player engagement. This system allows developers to focus on expanding game functionality instead of managing the underlying infrastructure.

### Cost

_You are responsible for the cost of the AWS services used while running this Guidance. As of August 2025, the cost for running this Guidance with the default settings in the US East (N. Virginia) region is approximately:_

- $92.06 per month for Data Lake (Hive Table)
- $65.88 per month for Data Lake (Iceberg Table)
- $252.50 for Amazon Redshift
- \+ $770.94 per month if real-time analytics are enabled

**NOTE:** The price estimates for Amazon Redshift and real-time analytics both include costs for an on-demand Amazon Kinesis data stream. If both options are enabled, the overlapping cost of the data stream will have to be subtracted. Pricing for Amazon Data Firehose may differ when the Amazon Kinesis data stream is enabled.

_We recommend creating a [Budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) through [AWS Cost Explorer](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/) to help manage costs. Prices are subject to change. For full details, refer to the pricing webpage for each AWS service used in this Guidance._

### Sample Cost Table

The following table provides a sample cost breakdown for components in the guidance in the US East (N. Virginia) Region for one month.

Assuming the following variables:
- 100 1kb game events recieved and processed per second = 259.2 million events per month 
- Requests batched by 100 (100kb batched) per API request = 2,592,000 requests per month (1 request per second)
- 100 queries per day scanning 100mb per query on average 
- 2 DPU Glue ETL jobs running for 2 minutes per day when using a Hive data lake as the data stack
- 0.01GB of entries in DynamoDB
- 259GB data (259 million 1kb entries)

The cost estimate consists of the required API component and choice of data stack (choose between Apache Hive data lake, Apache Iceberg data lake, and Amazon Redshift). There are optional configurations to enable a real-time Amazon Kinesis Data Stream and real-time analytics. To use Amazon Redshift as the data stack or real-time analytics, the Amazon Kinesis Data Stream must also be enabled. 

**NOTE:** These are rough estimates only, and even though they are calculated with a very pessimistic approach, there can always be some costs that are not fully covered here. You always need to do your own testing and estimates.

#### API Component
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon API Gateway | 2,592,000 REST API calls per month | $9.07/month |
| AWS Lambda | Authorizer Lambda, 2,592,000 calls per month, 200ms runtime per execution | $2.25/month |
| Amazon DynamoDB | 0.01GB entries for admin use, 2,592,000 GET requests | $0.41/month |

#### Kinesis Data Stream
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Kinesis Data Streams (On-Demand) | 259,200,000 requests, 1kb/record, 1 consumer | $58.87/month |
| Amazon Kinesis Data Streams (Provisioned) | 259,200,000 requests, 2 shards | $25.58/month |

*Choose between on-demand and provisioned capacity modes [based on your traffic patterns](https://docs.aws.amazon.com/streams/latest/dev/how-do-i-size-a-stream.html)*

#### Data Platform - Data Lake (Hive Table)
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Data Firehose | 259,200,000 records, 5kb/record, data format conversion | $58.90/month |
| AWS Lambda | Events Processing Lambda, 2,592,000 calls per month, 120ms runtime per execution | $1.56/month |
| Amazon Simple Storage Service (S3) | 259.2GB data | $7.27/month |
| AWS Glue Data Catalog | 1 million objects stored, 1 million requests | $11.00/month |
| AWS Glue | 2DPU 2 min ETL Jobs | $0.15/month |
| Amazon Athena | 100 queries per day scanning 100mb data avg | $1.45/month |

#### Data Platform - Data Lake (Iceberg Table)
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Data Firehose (Direct PUT) | 259,200,000 records, 1kb/record | $19.44/month |
| Amazon Data Firehose (Kinesis Data Streams) | 259,200,000 records, 1kb/record | $11.67/month |
| AWS Lambda | Events Processing Lambda 2,592,000 calls per month, 120ms runtime per execution | $1.56/month |
| Amazon Simple Storage Service (S3) | 259.2GB data | $7.27/month |
| AWS Glue Data Catalog | 1 million objects stored, 1 million requests, 120 minutes optimization | $12.76/month |
| Amazon Athena | 100 queries per day scanning 100mb data avg | $1.45/month |

*When Amazon Data Firehose is configured with Apache Iceberg Tables as a destination, the pricing will be billed per GB ingested with no 5KB increments. Pricing for Amazon Data Firehose varies depending on the source.*

#### Data Platform - Amazon Redshift
| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Redshift Serverless | 4 RPU 4 hour / day, 259.2gb managed storage | $181.90/month |

#### Real-Time Analytics (Optional)

| AWS service  | Dimensions | Cost [USD] |
| ----------- | ------------ | ------------ |
| Amazon Kinesis Data Streams (On-Demand Consumer) | additional consumer | $9.89/month |
| Amazon Managed Service for Apache Flink | 1 KPU | $165.60/month |
| Amazon Kinesis Data Streams (Provisioned) | 1 shard | $10.96/month |
| Amazon OpenSearch Service (Serverless) | 1 OCU Index + Search/Query + 1GB Index | $350.42/month |
| Amazon OpenSearch Service (Ingestion) | 1 Ingestion OCU Index | $175.20/month |

*When real-time analytics is enabled, the Apache Flink application is registered as an additional consumer of the Amazon Kinesis data stream. Additional charges apply when on-demand capacity is used.*

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

Refer to the full documentation in our [getting started guide](https://aws-solutions-library-samples.github.io/solutions/guidance/game-analytics-pipeline-on-aws/getting-started.html). The page provides full detailed walkthrough and deployment steps.

## Next Steps

Refer to the [customization documentation](https://aws-solutions-library-samples.github.io/solutions/guidance/game-analytics-pipeline-on-aws/customizations.html) for next steps and customizations.


## Cleanup

- To teardown the stack, run the `npm run destroy` command.
- The teardown command will not delete data stored in S3, DynamoDB tables, and if enabled, Redshift and OpenSearch. These components will have to be manually deleted.

## Notices

Customers are responsible for making their own independent assessment of the information in this Guidance. This Guidance: (a) is for informational purposes only, (b) represents AWS current product offerings and practices, which are subject to change without notice, and (c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided “as is” without warranties, representations, or conditions of any kind, whether express or implied. AWS responsibilities and liabilities to its customers are controlled by AWS agreements, and this Guidance is not part of, nor does it modify, any agreement between AWS and its customers.

## Authors

Daniel Lee, Nathan Yee, Matthew Kwan, Christian Orellana, Rene Roldan, and Steve Parker

Special thanks to Narendra Gupta and Satesh Sonti
