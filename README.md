# Game Analytics Pipeline on AWS

The Game Analytics Pipeline solution helps game developers to apply a flexible, and scalable DataOps methodology to their games. Allowing them to continuously integrate, and continuously deploy (CI/CD) a scalable serverless data pipeline for ingesting, storing, and analyzing telemetry data generated from games, and services. The solution supports streaming ingestion of data, allowing users to gain critical insights from their games, and other applications in near real-time, allowing them to focus on expanding, and improving game experience almost immediately, instead of managing the underlying infrastructure operations. Since the solution has been codified as a CDK application, game developers can determine the best solution modules that fit their use case, allowing them to test, and QA the best architecture before deploying into production. This modular system allows for additional AWS capabilities, such as AI/ML models, to be integrated into the architecture in order to further support real-time decision making, and automated LiveOps using AIOps, to further enhance player engagement. Essentially allowing developers to focus on expanding game functionality, rather than managing the underlying infrastructure operations.

![Architecture](./docs/architecture.png)
## Prerequisites

Before deploying the solution, ensure that the following required tools have been installed:

- **AWS Cloud Development Kit (CDK) 2.68**
- **Python 3**
- **NodeJS 16.20.0**

>__NOTE:__ It is recommended that that you configure, and deploy the solution using a pre-configured __[AWS Cloud9](https://aws.amazon.com/cloud9/)__ development environment. Refer to the _[Individual user setup for AWS Cloud9](https://docs.aws.amazon.com/cloud9/latest/user-guide/setup-express.html)_ for more information on how to set up Cloud9 as the only user in the AWS account. The Cloud9 IDE may have an updated version of the CDK installed therefore, run the `npm install -g aws-cdk@2.68.0 --force` to ensure that version `2.68.0` of the CDK is installed.

## Solution Configuration and Customization

Before deploying the solution, it needs to be customized to suite your specific usage requirements. Solution configuration, and customization, is managed using a `config.yaml` file, located in the `infrastructure` folder of the repository. 

### Configuration Setup

The following steps will walk you through how to customize the solution configuration to suite your usage requirements:

1. A configuration template file, called `config.yaml.TEMPLATE` has been provided as a reference for solution customizations. Run the following command to create a usable copy of this file:

    ```bash
    cp ./infrastructure/config.yaml.TEAMPLTE ./infrastructure/config.yaml
    ```

2. Open the `./infrastructure/config.yaml` file for editing.

### Custom Settings

The following following settings can be adjusted to suite your solution deployment:

- `WORKLOAD_NAME`
  - *Description:* The name of the solution that will deployed. This name will be used as a prefix for for any component deployed into your AWS Account.
  - *Type:* String 
  - *Example:* `"GameAnalyticsSo"`
- `CDK_VERSION`
  - *Description:* The version of the CDK installed in your environment. To see the current version of the CDK, run the `cdk --version` command. The solution has been tested using CDK version `2.68.0` of the CDK. If you are using a different version of the CDK, ensure that this version is also reflected in the `./infrastructure/package.json` file.
  - *Type:* String
  - *Example:* `"2.68.0"`
- `NODE_VERSION`
  - *Description:* The version of NodeJS being used. The default value is set to `"latest"`, and should only be changed this if you require a specific version.
  - *Type:* String
  - *Example:* `"latest"`
- `PYTHON_VESION`
  - *Description:* The version of Python being used. The default value is set to `"3.8"`, and should only be changed if you require a specific version.
  - *Type:* String
  - *Example:* `"3.8"`
- `DEV_MODE`
  - *Description:* Wether or not to enable developer mode. This mode will ensure synthetic data, and shorter retention times are enabled. It is recommended that you set the value to `true` when first deploying the solution for testing, as this setting will enable S3 versioning, and won't delete S3 buckets on teardown. This setting can be changed at a later time, and the solution re-deployed through CI/CD.
  - *Type:* Boolean
  - *Example:* `true`
- `ENABLE_STREAMING_ANALYTICS`
  - *Description:* Wether or not to enable the [Kinesis Data Analytics](https://aws.amazon.com/kinesis/data-analytics/) component/module of the solution. It is recommended to set this value to `true` when first deploying this solution for testing, as this setting will allow you to verify if streaming analytics is required for your use case. This setting can be changed at a later time, and the solution re-deployed through CI/CD.
  - *Type:* Boolean
  - *Example:* `true`
- `STREAM_SHARD_COUNT`
  - *Description:* The number of Kinesis shards, or sequence of data records, to use for the data stream.The default value has been set to `1` for initial deployment, and testing purposes. This value can be changed at a later time, and the solution re-deployed through CI/CD. For information about determining the shards required for your use case, refer to [Amazon Kinesis Data Streams Terminology and Concepts](https://docs.aws.amazon.com/streams/latest/dev/key-concepts.html) in the *Amazon Kinesis Data Streams Developer Guide*.
  - *Type:* Integer
  - *Example:* `1`
- `CODECOMMIT_REPO`
  - *Description:* The name of the [AWS CodeCoomit](https://aws.amazon.com/codecommit/), repository used as source control for the codified solution infrastructure, and CI/CD pipeline.


## Solution Deployment

In the `infrastructure` folder there is a `config.yaml.TEMPLATE`. Copy this and rename it to `config.yaml` and make the necessary changes to deploy your solution. You will have to add your own account numbers and regions at a minimum to ensure this works.


To deploy the solution
```
npm run build
npm run deploy.bootstrap
npm run deploy
```
---

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

