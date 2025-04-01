# Design Considerations
This page explains what drives the team's core decision-making for service selection, feature support, or component design. We use customer feedback to drive our tenets and decision-making, and encourage feedback through [GitHub Issues on the guidance repository](https://github.com/aws-solutions-library-samples/guidance-for-game-analytics-pipeline-on-aws/issues)

## Core Tenets
The Game Analytics Pipeline Guidance team has the current tenets defined as the guidance's primary goals, and should ultimately allow users to quickly spin up an architecture that:

1. Allows you to easily start deploying up-to-date analytics best practices for the game industry
2. Has an AWS opinionated balance of cost, performance, least management overhead, and scalability based on aggregate user feedback
3. Can be extensible architecturally for specific user needs

<br>
To address how we conclude our opinion on the balance of cost, performance, least management overhead, and scalability, we use feedback we have aggregated from AWS customers and users of the guidance, and continue to iterate and re-aggregate this data. Currently the data concludes the following:

- We want to prioritize least management overhead over cost to a certain cutoff (which we will continue to assess and tune)
- We want default scalability and performance options that address most use cases, but <u>need</u> documented manual scaling options, limits, and controls
- We want to ensure integration or a path for up-to-date mainstream alternative options

## Services
---
Why not use compute fleets (EC2, EKS, ECS, etc) for data processing?

- The Game Analytics Pipeline Guidance leans on AWS Managed Services due to their ability to address the above management overhead and default scaling and performance options.

---

Why not Amazon EMR Serverless?

- Glue and Athena provides interfaces for jobs/queries and direct console integration, and EMR requires spark code and notebook just to write scripts. This lets Glue and Athena reduce time to getting started, and management overhead. This does not mean EMR is a worse option, Glue just aligns with the specific above tenets more. The team is open to an EMR deployment option based on user feedback.

---
Why not Sagemaker Unified Studio, or Lakehouse?

- This feature is in Preview as of this document, and once it is fully Globally Available, the team will re-assess.

---
Why Glue Workflow instead of Amazon Managed Workflows for Apache Airflow (MWAA)?

- MWAA requires a VPC and all associated networking resources to be created, which adds more networking management overhead and more network-related performance considerations that are otherwise all managed under the hood by Glue Workflows. However, Glue Workflows is only constrained to Glue, whereas MWAA supports more options outside of Glue, which is a case of balancing conflicting aspects of the guidance's tenets. Currently we weigh the less management overhead option over the integration for mainstream alternative options. We are open to feedback to re-align MWAA based on user feedback through Github Issues on the repository.

---
Why use API Gateway?

- Compared to direct code to the respective AWS services, or event buses like SQS/EventBridge, API Gateway provides the following benefits:
    - An authorization workflow using an Authorizer Lambda to ensure events are sending to the correct game/application and not cross-contaminate events. (Up-to-date best practices)
    - A universal endpoint (RESTful HTTP/HTTPS) that is more compatible and less custom code or libraries required (Less Management Overhead)

- Compared to a Lambda endpoint, API Gateway also provides direct pass-through that would be cheaper, and rejected API calls are still sent to CloudWatch logs, which would be more simplified and managed than Dead-letter-queue or forwarding logic from Lambda

---
Why can't I deploy both the Data Lake and Redshift option at the same time?

- The choice between Data Lake mode and Redshift mode boils down to your query performance needs and amount of data scanned. The vast majority of customers will only need one option or the other, and in the rare case that there are mixed cases, you can visit the [Customizations page](./customizations.md) to allow both options (Extensibility tenet). Allowing both as a default would create decision paralysis and perceived complexity in the deployed infrastructure, so we skim down the infrastructure to base necessities to address the above core tenets.
- For infrastructure, the Redshift Data Warehouse option has an integration to store in S3 as a Data Lake store, and has features such as Redshift Spectrum to allow the same query experience regardless of the data store (S3 or Redshift). 

---

Why KDS/MSK in between Flink and Data Lake / Redshift?

---

Why QuickSight?

- ASKING ANDREI, TBD

---
## Processes

- When should I use Data Lake mode vs Redshift mode?
- When should I utilize real-time analytics?
- When should I use KDS vs MSK?
- Why DynamoDB with application_id 
- why is the Schema the way we designed it?