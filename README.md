# Game Analytics Pipeline on AWS

The Game Analytics Pipeline solution helps game developers to apply a flexible, and scalable DataOps methodology to their games. Allowing them to continuously integrate, and continuously deploy a scalable serverless data pipeline for ingesting, storing, and analyzing telemetry data generated from games, and services. The solution supports streaming ingestion of data, allowing users to gain critical insights from their games, and other applications in near real-time, allowing them to focus on expanding, and improving game experience almost immediately, instead of managing the underlying infrastructure operations. Since the solution has been codified as a CDK application, game developers can determine the best solution modules that fit their use case, allowing them to test, and QA the best architecture before deploying into production. This modular system allows for additional AWS capabilities, such as AI/ML models, to be integrated into the architecture in order to further support real-time decision making, and automated LiveOps using AIOps, to further enhance player engagement. Essentially allowing developers to focus on expanding game functionality, rather than managing the underlying infrastructure operations.
## Prerequisites

Before deploying the solution, ensure that the following required tools have been installed:

>__NOTE:__ It is recommended that that the solution deployed using the a pre-configured __(AWS Cloud9)[https://aws.amazon.com/cloud9/] environment. Refer to the _(Individual user setup for AWS Cloud9)[https://docs.aws.amazon.com/cloud9/latest/user-guide/setup-express.html] for more information.

- AWS Cloud Development Kit (CDK) 2.68 (or greater)
- Python 3.7.16 (or greater)
- NodeJS 16.20.0

## Deployment

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

