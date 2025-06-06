# Getting Started

This guide is intended for users integrating game analytics pipeline for the first time. If you have an existing Game Analytics Pipeline deployment and need to upgrade to the latest version, see the [Upgrading](./upgrading/v2-to-v3-changes.md) page.

## Prerequisites

The following resources are required to install, configure, and deploy the game analytics pipeline. 

- **Amazon Web Services Account**
- **[GitHub Account](https://docs.github.com/en/get-started/start-your-journey/creating-an-account-on-github)**
- **[Visual Studio Code](https://code.visualstudio.com/Download)\***
- **API Client: [Postman Desktop](https://www.postman.com/) or [Bruno](https://www.usebruno.com/)**

*\*Other code editors can also be used, but tooling support may be limited*

### Option 1 - Dev Container (Recommended)

A [development container](https://docs.github.com/en/codespaces/setting-up-your-project-for-codespaces/adding-a-dev-container-configuration/introduction-to-dev-containers) configuration has been provided for you. This image container the necessary *Python*, *NodeJS*, and the *AWS CDK* versions needed to implement this guidance. It is **recommended**, that you use the pre-configured [environment](https://code.visualstudio.com/docs/devcontainers/containers) as your development environment.

To use Dev Containers, a container platform such as [Docker Desktop (local)](https://www.docker.com/products/docker-desktop/) or [Finch](https://runfinch.com/) must be installed and running.

#### Installing the Dev Container Extension for VSCode

Install the Dev Containers extension for Visual Studio Code.

1. Navigate to the [Dev Containers extension page](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) in the Visual Studio Marketplace

2. Click **Install** to add the extension to VSCode

*\*Other code editors such as the [Jetbrains suite](https://plugins.jetbrains.com/plugin/21962-dev-containers) also support Dev Containers.*

#### (Optional) Configure VSCode to use Finch

Finch is an open source client for container development. 

To use Finch, follow the [instructions in the Finch documentation](https://runfinch.com/docs/getting-started/installation/) to install and initialize Finch for your chosen operating system.

After Finch is installed and running, follow the [instructions in the Finch documentation](https://runfinch.com/docs/integrations/devcontainers-on-finch/) to configure the Dev Container Extension to utilize Finch as the container platform to run the dev container for your chosen operating system.

#### Using the Dev Container

After following the instructions in [Installation](#installation), when the project is opened in your code editor, a popup will appear indicating that the folder contains a dev container configuration. To utilize the Dev Container environment, click on “Reopen in Container”.

### Option 2 - Manual Install

Before deploying the sample code, ensure that the following required tools have been installed:

- **[Docker Desktop (local)](https://www.docker.com/products/docker-desktop/) or [Finch](https://runfinch.com/)**
- **[Apache Maven](https://maven.apache.org/install.html)**
- **AWS Cloud Development Kit (CDK) 2.92 or Terraform**
- **Python >=3.8**
- **NodeJS >= 22.0.0**

If Finch is installed, set the `CDK_DOCKER` environment variable to `finch`

```bash
CDK_DOCKER="finch"
```

!!! Warning
    The NPM commands to build and deploy the project are written to use UNIX shell commands. Because of this, **the manual install is incompatible with the Windows Powershell** without modifications to the NPM commands. Please consider using the Dev Container to have a consistent deployment environment.

## Installation

The following steps will walk you through how to install the Game Analytics Pipeline

1. Log into your GitHub account, and navigate to the the [Game Analytics Pipeline repository](https://github.com/aws-solutions-library-samples/guidance-for-game-analytics-pipeline-on-aws)

2. [Fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/fork-a-repo) into your GitHub account

3. From your fork, [clone your repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository) to a local folder on your machine

4. Navigate to the root of the local folder and open the project in your code editor

## Configuration

### Choose your Deployment Option

The Game Analytics Pipeline can be deployed using [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) or [Terraform](https://developer.hashicorp.com/terraform). 

To select your deployment option, open the `package.json` file at the root of the repository. 

At the top of the `package.json` file there is a `"config"` block. Set the `"iac"` config option to `"cdk"` to use the CDK deployment option or `"tf"` to use the Terraform deployment option.

```json
  "config": {
    "iac": "cdk" | "tf"
  },
```

Avoid changing this option after the stack is deployed without first destroying the created resources. 

### Configuration Parameters

Before deploying the sample code, deployment parameters need to be customized to suite your specific usage requirements. Guidance configuration, and customization, is managed using a `config.yaml` file, located in the infrastructure folder of the repository.

A configuration template file, called `config.yaml.TEMPLATE` has been provided as a reference for use case customizations. 

Using the provided devcontainer environment, run the following command to copy the template to  `./infrastructure/config.yaml`:
```bash
cp ./infrastructure/config.yaml.TEMPLATE ./infrastructure/config.yaml
```
Open the `./infrastructure/config.yaml` file for editing. Configure the parameters for the pipeline according to the options available in [Customizations](customizations.md).

## Deployment

!!! Info
    **Security credentials for the target AWS account must be configured** on the machine before deploying the pipeline. This lets AWS know who you are and what permissions you have to deploy the pipeline. These credentials must have permissions to create new resources within the account, including new IAM Roles.

    There are different ways in which you can configure programmatic access to AWS resources, depending on the environment and the AWS access available to you. Please consult the following documentation based on your deployment option to configure the credentials before proceeding with this section.

    - [AWS Cloud Development Kit (CDK)](https://docs.aws.amazon.com/cdk/v2/guide/configure-access.html)

    - [HashiCorp Terraform](https://registry.terraform.io/providers/hashicorp/aws/latest/docs#authentication-and-configuration)

Once you have set your own custom configuration settings, and saved the config.yaml file, then following steps can be used to deploy the game analytics pipeline:

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

## Running the Deployed Pipeline

Before sending events to the pipeline, an Application and corresponding Authorization key will need to be created. Additionally, if the `REAL_TIME_ANALYTICS` configuration is set to `true` the Flink application needs to be running to process events in real time. 

### Configuring your API Client

A Postman collection file is provided to help configure Postman or Bruno for use with the solution. 

The collection file is located at `TBD`

For instructions on how to import a collection, refer to the documentation for your selected API Client:

- Postman: [Import Postman data](https://learning.postman.com/docs/getting-started/importing-and-exporting/importing-data/#import-postman-data)

- Bruno: [Importing Enviornment into Bruno](https://docs.usebruno.com/get-started/import-export-data/postman-migration#importing-environment-into-bruno)

Once the collection is imported into your API client, configure the collection-wide `api_base_path` variable to be your deployed API base path. 

You can locate your created `api_base_path` by examining the build output for the `ApiBasePath` output.

In order to perform administrator actions on your API, Authentication must be configured to utilize SigV4 authentication for an IAM identity. These credentials must be configured for every API endpoint except [POST - Send Events](./references/api-reference.md#post---send-events).

For instructions on how to configure SigV4 Authentication, refer to the documentation for your selected API Client:

- Postman: [Authenticate with AWS Signature authentication workflow in Postman](https://learning.postman.com/docs/sending-requests/authorization/aws-signature/)

- Bruno: [Authenticate using AWS Signature](https://docs.usebruno.com/auth/aws-signature)

### Creating a new Application

1. After the pipeline is deployed, a new application must be created using the Application API. Refer to the [API Reference for POST - Create Application](./references/api-reference.md#post---create-application) on how to register a new application. **Note the value of the `"ApplicationId"` in the API response.**

2. After the application is created, create an API key to send events to the API. Refer to the [API Reference for POST - Create API Key for Application](./references/api-reference.md#post---create-api-key-for-application) on how to create a new authorization key. The `"ApplicationId"` from the previous step should be passed in the API path. **Note the value of the `"ApiKeyValue"` in the API response.**

### Starting Flink

If the `REAL_TIME_ANALYTICS` configuration is set to `true`, a Flink Application will be created. This application needs to be in the `RUNNING` state for incoming events to be processed in real time. 

1. Navigate to the AWS Console. Open the console for Managed Apache Flink by searching "Flink" in the search bar and selecting "Managed Apache Flink."

2. Click on the Apache Flink applications page on the side menu. 

3. Locate the Flink Application created by Game Analytics Pipeline. The name will end in `-AnalyticsApplication` or contain `ManagedFlinkConstruct`. Click on the blue link under Application name to navigate to the control page.

4. Click on the **Run** button at the top right of the menu. Configure the Snapshots option to **Run without snapshot** when starting for the first time. Click on the **Run** button again to start the application.

5. Wait for the Status to show as **Running**

For more information and troubleshooting, refer to the documentation for [Run a Managed Service for Apache Flink application](https://docs.aws.amazon.com/managed-flink/latest/java/how-running-apps.html).

## Send Events to the Pipeline

Refer to the [API Reference for POST - Send Events](./references/api-reference.md#post---send-events) for details on how to send events to the API endpoint.

The request to send events to the solution API must include a valid API key in the Authorization header, which is authorized to send events for the application. **Include the `"ApplicationId"` in the API URL path and the `"ApiKeyValue"` of the API authorization in the header of the request. These were created during the [Creating a new Application step](#creating-a-new-application) in this guide.**

## Next Steps

- [Customizations](customizations.md)
- [Troubleshooting](troubleshooting.md)
- [References](references/api-reference.md)