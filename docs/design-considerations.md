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

- Glue provides interfaces for jobs and direct console integration, and EMR requires spark code and notebook just to write scripts. This lets Glue reduce time to getting started, and management overhead. This does not mean EMR is a worse option, Glue just aligns with the specific above tenets more.

---
Why not Sagemaker Unified Studio, or Lakehouse?

- This feature is in Preview as of this document, and once it is fully Globally Available, the team will re-assess.

---
Why not Glue Workflow instead of Amazon Managed Workflows for Apache Airflow (MWAA)?

- Glue Workflows is only constrained to Glue, whereas MWAA supports more options. This aligns better with our extensibility tenet.

---
Why use SQS instead of API Gateway?

- TODO: WAIT ON THIS. SQS is cheaper and better for real time, but unify everything under a single interface, can write directly if they want

---
Why QuickSight?
- ASKING ANDREI, TBD

---
S3/Athena vs Redshift (TO BE CHANGED)

---
## Processes

- Why only REST HTTP API, why not send passthrough or direct?
- Why extra lambdas?

- Why DynamoDB with application_id 
- why is the Schema the way we designed it?