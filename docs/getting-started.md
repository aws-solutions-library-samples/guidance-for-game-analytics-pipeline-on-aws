# Getting Started

## Prerequisites

Before deploying the sample code, ensure that the following required tools have been installed:

- **[GitHub Account](https://docs.github.com/en/get-started/start-your-journey/creating-an-account-on-github)**
- **[Visual Studio Code](https://code.visualstudio.com/Download)**
- **[Docker Desktop (local)](https://www.docker.com/products/docker-desktop/)**
- **AWS Cloud Development Kit (CDK) 2.92**
- **Python >=3.8**
- **NodeJS >= 20.0.0**

>__NOTE:__ A Visual Studio Code [dev container](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers) configuration has been provided for you. This image container the necessary *Python*, *NodeJS*, and the *AWS CDK* versions needed to implement this guidance. It is **recommended**, that you use the pre-configured [environment](https://code.visualstudio.com/docs/devcontainers/containers) as your development environment.  

## Sample Code Configuration and Customization

Before deploying the sample code, it needs to be customized to suite your specific usage requirements. Guidance configuration, and customization, is managed using a `config.yaml` file, located in the `infrastructure` folder of the repository. 

### Configuration Setup

The following steps will walk you through how to customize the sample code configuration to suite your usage requirements:

1. Log into your GitHub account, and [fork this repository](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) into your GitHub account.

2. Follow the instructions on how to (Create a connection to GitHub)[https://docs.aws.amazon.com/dtconsole/latest/userguide/connections-create-github.html#connections-create-github-console], to connect AWS CodePipeline to the forked copy of this repository. Once the connection has been created, make a note of the Amazon Resource Name (ARN) for the connection.

3. A configuration template file, called `config.yaml.TEMPLATE` has been provided as a reference for use case customizations. Using the provided Visual Studio Code devcontainer environment, run the following command to create a usable copy of this file:

    ```bash
    cp ./infrastructure/config.yaml.TEMPLATE ./infrastructure/config.yaml
    ```

2. Open the `./infrastructure/config.yaml` file for editing.

### Custom Settings

The following settings can be adjusted to suite your use case:

1. **`WORKLOAD_NAME`**
    - *Description:* The name of the workload that will deployed. This name will be used as a prefix for for any component deployed into your AWS Account.
    - *Type:* String 
    - *Example:* `"GameAnalyticsPipeline"`
2. **`CDK_VERSION`**
    - *Description:* The version of the CDK installed in your environment. To see the current version of the CDK, run the `cdk --version` command. The guidance has been tested using CDK version `2.92.0` of the CDK. If you are using a different version of the CDK, ensure that this version is also reflected in the `./infrastructure/package.json` file.
    - *Type:* String
    - *Example:* `"2.92.0"`
3. **`NODE_VERSION`**
    - *Description:* The version of NodeJS being used. The default value is set to `"latest"`, and should only be changed this if you require a specific version.
    - *Type:* String
    - *Example:* `"latest"`
    >__NOTE:__ It is recommended that you use the same AWS Account, as well as the same AWS Region, for both the `QA`, and `PROD` stages, when first deploying the guidance.

## Sample Code Deployment

Once you will have to add your own custom configuration settings, and saved the `config.yaml` file, then following steps can be used to deploy the CI/CD pipeline:

1. Build the sample code dependencies, by running the following command:
    ```bash
    npm run build
    ```
2. Bootstrap the sample code, by running the following command:
    ```bash
    npm run deploy.bootstrap
    ```
3. Deploy the sample code, by running the following command:
    ```bash
    npm run deploy
    ```

After the sample code has been deployed, two CloudFormation stacks are created within you AWS Account, and AWS Region:

1. `PROD-<WORKLOAD NAME>`: The deployed version of the guidance infrastructure.
2. `<WORKLOAD NAME>-Toolchain`:  The CI/CD Pipeline for the guidance.

### Deployed Infrastructure

The stack hosts the deployed production version of the AWS resources for you to validate, and further optimize the guidance for your use case. 

### CI/CD Toolchain

Once the deployed infrastructure has been validated, or further optimized for your use case, you can trigger the continuos deployment, by committing any updated source code into the newly create CodeCommit repository, using the following steps:

1. Copy the URL for cloning CodeCommit repository that you specified in the `config.yanl` file. See the **View repository details (console)** section of the [AWS CodeCommit User Guid](https://docs.aws.amazon.com/codecommit/latest/userguide/how-to-view-repository-details.html) for more information on how to vie the *Clone URL* for the repository.
2. Create a news Git repository, by running the following command:
   ```bash
   rm -rf .git
   git init --initial-branch=main
   ```
3. Add the CodeCommit repository as the origin, using the following command:
   ```bash
   git remote add origin <CodeCommit Clone URL>
   ```
4. Commit the code to trigger the CI/CD process, by running the following commands:
   ```bash
   git add -A
   git commit -m "Initial commit"
   git push --set-upstream origin
   ```

## Next Steps

Make any code changes to subsequently optimize the guidance for your use case. Committing these changes will trigger a subsequent continuous integration, and deployment of the deployed production stack, `PROD-<WORKLOAD NAME>`.

## Cleanup

To clean up any of the deployed resources, you can either delete the stack through the AWS CloudFormation console, or run the `cdk destroy` command.

>__NOTE:__ Deleting the deployed resources will not delete the Amazon S3 bucket, in order to protect any game data already ingested, and stored with the data lake. The Amazon S3 Bucket, and data, can be deleted from Amazon S3 using the Amazon S3 console, AWS SDKs, AWS Command Line Interface (AWS CLI), or REST API. See the [Deleting Amazon S3 objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjects.html) section of the user guide for mor information.