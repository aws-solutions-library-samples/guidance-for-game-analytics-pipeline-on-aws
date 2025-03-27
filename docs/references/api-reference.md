# API Reference
The Game Analytics Pipeline API is the entry point for applications to send data, and it provides functionality for administrators to programmatically configure registered applications. The solution supports HTTPS only, using a certificate managed by AWS. For information about configuring a custom domain for your REST API, refer to [Setting up custom domain names for REST APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-custom-domains.md) in the Amazon API Gateway Developer Guide.

!!! info 
    - The base path to the API is: `https://{YOUR_API_URL}/live` unless you set a different API stage name under the config file.
        - For example, the full path to one of the API calls could be `https://{YOUR_API_URL}/live/applications/{APPLICATION_ID}/authorizations/{API_KEY_ID}`.
        - Refer to the [Getting Started](../getting-started.md) section to get your API URL, API stage name, and for steps on interacting with the API. Refer to the [Component Deep Dive](../component-deep-dive.md) section to understand how the API's authentication and underlying processes work.
    - [Quick link to sending events](./api-reference.md#sending-events). Sending events requires an application and it's corresponding authorization token, for explanations see the other API calls first. All other API calls are administrative.

---
### Applications
`/applications`
#### POST - Create Application
- **Description**
    - This operation enables you to register a new application with the solution. Applications represent a specific game/application to perform per-application analytics on.

- **Request**
    - **Body**
        - **Name** (*String*) [Required] - Name of the application to register.
        - **Description** (*String*) [Optional] - Description of the application.
    ``` hcl
    POST
    https://{YOUR_API_ENDPOINT_URL}/live/applications
    {
        "Name": "TestGame"
        "Description": "This is a test game"
    }
    ```

- **Response**
    - `200` - Application information is stored in a DynamoDB Table deployed by the solution. See [Component Deep Dive](../component-deep-dive.md) for details on the process.
    ``` hcl
    {
        "ApplicationId": "d76d064f-ca8b-41ff-839f-4735e9a4b69d",
        "ApplicationName": "TestGame",
        "Description": "This is a test game",
        "UpdatedAt": "2025-01-26T21:45:50Z",
        "CreatedAt": "2025-01-26T21:45:50Z"
    }
    ```
        - **ApplicationId** (*String*) - A unique UUID representing the Application. Keep this value for performing actions on this specific Application. See the below `GET - List Applications` documentation to view all Applications.
        - **ApplicationName** (*String*) - The name of the created Application, same as the one sent in the request.
        - **Description** (*String*) - The description of the created Application, same as the one sent in the request.
        - **UpdatedAt** (*DateTime*) - The date and time the application was last updated.
        - **ErrorCode** (*DateTime*) - The date and time the application was created.

    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

#### GET - List Applications
- **Description**
    - This operation enables you to list the applications that are registered with the solution. Applications represent a specific game/application to perform per-application analytics on.

- **Request**
    ``` hcl
    GET
    https://{YOUR_API_ENDPOINT_URL}/live/applications
    ```

- **Response**
    - `200` - Application information is stored in a DynamoDB Table deployed by the solution. See [Component Deep Dive](../component-deep-dive.md) for details on the process.
    ``` hcl
    {
        "Applications": [
            {
                "ApplicationId": "d76d064f-ca8b-41ff-839f-4735e9a4b69d",
                "ApplicationName": "TestGame",
                "Description": "This is a test game",
                "UpdatedAt": "2025-01-26T21:45:50Z",
                "CreatedAt": "2025-01-26T21:45:50Z"
            }
        ],
        "Count": 1
    }
    ```
        - **Count** (*Number*) - The number of registered applications.
        - **Applications** (*Array*) - Array of `Application` objects representing details on each registered Application:
            - **ApplicationId** (*String*) - A unique UUID representing the Application. Keep this value for performing actions on this specific Application. See the below `GET - List Applications` documentation to view all Applications.
            - **ApplicationName** (*String*) - The name of the created Application, same as the one sent in the request.
            - **Description** (*String*) - The description of the created Application, same as the one sent in the request.
            - **UpdatedAt** (*DateTime*) - The date and time the application was last updated.
            - **ErrorCode** (*DateTime*) - The date and time the application was created.

    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

---

### Per-Application
`/applications/{APPLICATION_ID}`
#### GET - Get an Application's Detail
- **Description**
    - This operation enables you to describe the details of a registered application. Applications represent a specific game/application to perform per-application analytics on.

- **Request**
    ``` hcl
    GET
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}
    ```

- **Response**
    - `200` - Application information is stored in a DynamoDB Table deployed by the solution. See [Component Deep Dive](../component-deep-dive.md) for details on the process.
    ``` hcl
    {
        "ApplicationId": "d76d064f-ca8b-41ff-839f-4735e9a4b69d",
        "ApplicationName": "TestGame",
        "Description": "This is a test game",
        "UpdatedAt": "2025-01-26T21:45:50Z",
        "CreatedAt": "2025-01-26T21:45:50Z"
    }
    ```
        - **ApplicationId** (*String*) - A unique UUID representing the Application. Keep this value for performing actions on this specific Application. See the below `GET - List Applications` documentation to view all Applications.
        - **ApplicationName** (*String*) - The name of the created Application, same as the one sent in the request.
        - **Description** (*String*) - The description of the created Application, same as the one sent in the request.
        - **UpdatedAt** (*DateTime*) - The date and time the application was last updated.
        - **ErrorCode** (*DateTime*) - The date and time the application was created.

    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

#### DELETE - Delete Application
- **Description**
    - This operation enables you to delete a registered application. Applications represent a specific game/application to perform per-application analytics on.

!!! Warning
    Data that was ingested by deleted applications remains in Amazon
    Simple Storage Service (Amazon S3) after deletion, but new data cannot be submitted
    to the solution API after an application is deleted. When an application is deleted, all
    associated API key authorizations are also deleted.

- **Request**
    ``` hcl
    DELETE
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}
    ```

- **Response**
    - `200`
    ``` hcl
    "Delete Successful"
    ```
    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.
---

### Sending Events
`/applications/{APPLICATION_ID}/events`

#### POST - Send Events

- **Description**
    - This operation enables you to send a batch game events in a single API request to the Game Analytics Pipeline solution. Please review the [Component Deep Dive](../component-deep-dive.md) section for batching/size/service limits.

- **Request**
    - **Header**
        - **Authorization** (*String*) [Required] - The API Key's Value/code for the application. See either [Getting Started](../getting-started.md) or the below Authorizations/API Key references for high level steps / details on creating or obtaining an API Key. See [Component Deep Dive](../component-deep-dive.md) for more details on the process and [Design Considerations](../design-considerations.md) for reasoning.
    - **Body**
        - **Events** (*Array*) [Required] - Array/List of game event JSON objects to send to the pipeline **INSERT NOTE ABOUT SCRIPT/SAMPLE OF GAME EVENTS HERE.
    ``` hcl
    POST
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}/events
    Authorization: "KKNL09jc1Ub7WQzmZZ+9BNfxLCOhhJGKGkpHyWy+uk6J6WrIj3x8tbJLkIkZUSxzBgT4RyUOOy7ZBKSaj0y2Zg=="
    {
        "events": [Array/List of Game Event Objects]
    }
    ```

- **Response**
    - `200` - Sent even if there are some unsuccessful events. This includes successful and failed records.
    ``` hcl
    {
        "Total": 2,
        "FailedRecordCount": 1,
        "Events": [
            {
                "Result": "Ok",
                {
                    "Result": "Error",
                    "ErrorCode": "InvalidAction"
                }
            }
        ]
    }
    ```
        - **Total** (*Number*) - Number of received events
        - **FailedRecordCount** (*Integer*) - Number of failed events in the batch
        - **Events** (*List*) - List of each event's result
        - **Result** (*String*) - Response message for an event
        - **ErrorCode** (*String*) - Response code for an error event. 

    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

---

### Authorizations
`/applications/{APPLICATION_ID}/authorizations`
#### POST - Create API Key for Application
- **Description**
    - This operation generates a new API key that is authorized to send events to a specific Application. When sending events to an Application with the above `Sending Events` API call, the API Key's value/code is included in the `Authorization` header for security. See [Component Deep Dive](../component-deep-dive.md) for more details on the process and [Design Considerations](../design-considerations.md) for reasoning.

- **Request**
    - **Body**
        - **Name** (*String*) [Required] - Name of the API key to create.
        - **Description** (*String*) [Optional] - Description of the API Key being created.
    ``` hcl
    POST
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}/authorizations
    {
        "Name": "TestKey"
        "Description": "This is a test key for my game"
    }
    ```

- **Response**
    - `200` - Key/authorization information is stored in a DynamoDB Table deployed by the solution. See [Component Deep Dive](../component-deep-dive.md) for details on the process.
    ``` hcl
    {
        "ApiKeyId": "01af2cb3-8b1f-4bc0-801a-884a30fcb8cd",
        "ApiKeyValue": "KKNL09jc1Ub7WQzmZZ+9BNfxLCOhhJGKGkpHyWy+uk6J6WrIj3x8tbJLkIkZUSxzBgT4RyUOOy7ZBKSaj0y2Zg==",
        "ApiKeyName": "TestKey",
        "ApplicationId": "d76d064f-ca8b-41ff-839f-4735e9a4b69d",
        "ApiKeyDescription": "This is a test key for my game",
        "CreatedAt": "2025-01-26T21:46:25Z",
        "UpdatedAt": "2025-01-26T21:46:25Z",
        "Enabled": true
    }
    ```
        - **ApiKeyId** (*String*) - A unique UUID representing the key being created.
        - **ApiKeyValue** (*String*) - The value of the key. This value is used for the `Authorization` header when sending events to an Application with the above `Sending Events` API call
        - **ApiKeyName** (*String*) - The name of the created key, same as the one sent in the request.
        - **ApplicationId** (*String*) - A unique UUID representing the Application that this key is made for.
        - **ApiKeyDescription** (*String*) - The description of the created key, same as the one sent in the request.
        - **CreatedAt** (*DateTime*) - The date and time the key was created.
        - **UpdatedAt** (*DateTime*) - The date and time the key was last updated.
        - **Enabled** (*Boolean*) - Whether the key is enabled or disabled.

    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

#### GET - List Authorizations for an Application
- **Description**
    - This operation enables you to list the API key authorizations associated with an application.

- **Request**
    ``` hcl
    GET
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}/authorizations
    ```

- **Response**
    - `200` - Key/authorization information is stored in a DynamoDB Table deployed by the solution. See [Component Deep Dive](../component-deep-dive.md) for details on the process.
    ``` hcl
    {
        "Authorizations": [
            {
                "ApiKeyId": "01af2cb3-8b1f-4bc0-801a-884a30fcb8cd",
                "ApiKeyValue": "KKNL09jc1Ub7WQzmZZ+9BNfxLCOhhJGKGkpHyWy+uk6J6WrIj3x8tbJLkIkZUSxzBgT4RyUOOy7ZBKSaj0y2Zg==",
                "ApiKeyName": "TestKey",
                "ApplicationId": "d76d064f-ca8b-41ff-839f-4735e9a4b69d",
                "ApiKeyDescription": "This is a test key for my game",
                "CreatedAt": "2025-01-26T21:46:25Z",
                "UpdatedAt": "2025-01-26T21:46:25Z",
                "Enabled": true
            }
        ],
        "Count": 1
    }
    ```
        - **Count** (*Number*) - The number of registered authorizations.
        - **Authorizations** (*Array*) - Array of `Authorization` objects representing details on each registered Authorization for the Application:
            - **ApiKeyId** (*String*) - A unique UUID representing the key being created.
            - **ApiKeyValue** (*String*) - The value of the key. This value is used for the `Authorization` header when sending events to an Application with the above `Sending Events` API call
            - **ApiKeyName** (*String*) - The name of the created key, same as the one sent in the request.
            - **ApplicationId** (*String*) - A unique UUID representing the Application that this key is made for.
            - **ApiKeyDescription** (*String*) - The description of the created key, same as the one sent in the request.
            - **CreatedAt** (*DateTime*) - The date and time the key was created.
            - **UpdatedAt** (*DateTime*) - The date and time the key was last updated.
            - **Enabled** (*Boolean*) - Whether the key is enabled or disabled.

    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

---

### API Keys
`/applications/{APPLICATION_ID}/authorizations/{API_KEY_ID}`
#### GET - Get an Authorization's Details
- **Description**
    - This operation enables you to describe the details of an application's API Key Authorization.

- **Request**
    ``` hcl
    GET
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}/authorizations/{API_KEY_ID}
    ```

- **Response**
    - `200` - Key/authorization information is stored in a DynamoDB Table deployed by the solution. See [Component Deep Dive](../component-deep-dive.md) for details on the process.
    ``` hcl
    {
        "ApiKeyId": "01af2cb3-8b1f-4bc0-801a-884a30fcb8cd",
        "ApiKeyValue": "KKNL09jc1Ub7WQzmZZ+9BNfxLCOhhJGKGkpHyWy+uk6J6WrIj3x8tbJLkIkZUSxzBgT4RyUOOy7ZBKSaj0y2Zg==",
        "ApiKeyName": "TestKey",
        "ApplicationId": "d76d064f-ca8b-41ff-839f-4735e9a4b69d",
        "ApiKeyDescription": "This is a test key for my game",
        "CreatedAt": "2025-01-26T21:46:25Z",
        "UpdatedAt": "2025-01-26T21:46:25Z",
        "Enabled": true
    }
    ```
        - **ApiKeyId** (*String*) - A unique UUID representing the key being created.
        - **ApiKeyValue** (*String*) - The value of the key. This value is used for the `Authorization` header when sending events to an Application with the above `Sending Events` API call
        - **ApiKeyName** (*String*) - The name of the created key, same as the one sent in the request.
        - **ApplicationId** (*String*) - A unique UUID representing the Application that this key is made for.
        - **ApiKeyDescription** (*String*) - The description of the created key, same as the one sent in the request.
        - **CreatedAt** (*DateTime*) - The date and time the key was created.
        - **UpdatedAt** (*DateTime*) - The date and time the key was last updated.
        - **Enabled** (*Boolean*) - Whether the key is enabled or disabled.

    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

#### DELETE - Delete an Authorization
- **Description**
    - This operation enables you to delete an API key associated with an application.

- **Request**
    ``` hcl
    DELETE
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}/authorizations/{API_KEY_ID}
    ```

- **Response**
    - `200`
    ``` hcl
    "Delete Successful"
    ```
    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.

#### PUT - Enable/Disable Authorization
- **Description**
    - This operation enables you to enable or disable an API key without deleting it from the database.

!!! Warning
    API Gateway authorization caching is enabled in the solution API. It may
    take up to 300 seconds (5 minutes) before a change to the Enabled status of an API
    key is detected by the LambdaAuthorizer Lambda function. To reduce this time,
    you can [modify or disable the Authorization Cache](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-caching.md). Reducing or removing this cache
    TTL (time-to-live) results in additional queries to the Authorizations DynamoDB
    table and increases costs.

- **Request**
    - **Body**
        - **Enabled** (*Boolean*) [Required] - Enabling or Disabling the key.
    ``` hcl
    PUT
    https://{YOUR_API_ENDPOINT_URL}/live/applications/{APPLICATION_ID}/authorizations/{API_KEY_ID}
    {
        "Enabled": false
    }
    ```

- **Response**
    - `200`
    ``` hcl
    {
        "Enabled": false
    }
    ```
    - `4XX/5XX` - See the [Troubleshooting](../troubleshooting.md) section for errors.
---