The solution configures the following JSON schema to validate telemetry data sent to the solution API. To see how the solution utilizes the JSON schema during the event process, see [Component Deep Dive](../component-deep-dive.html) for details on the process.

!!! Info
    The `application_id` field is not required when sending events using the
    solution API events endpoint because it is automatically set in the data record by the
    API using the path of the API request after the request has been
    authorized. Applications that integrate directly with Amazon Kinesis Data Streams
    must provide an `application_id` for each event that is submitted.

There are sample queries built into the solution that you can refer to in [Customizations](../customizations.html). There are also sample scripts that create sample events built into the solution that you can utilize and refer to in [Getting Started](../getting-started.html).

## Event Schema Sample

``` hcl
{
    "event_id": "34c74de5-69d9-4f06-86ac-4b98fef8bca9",
    "event_name": "login",
    "event_type": "client",
    "event_version": "1.0.0",
    "event_timestamp": 1737658977,
    "app_version": "1.0.0",
    "event_data":
    {
        "platform": "pc",
        "last_login_time": 1737658477
    }
}
```

## Definitions

---
### `event_id`
- Type: `string`
- Description:
    - A random UUID that unique identifies this event. Your event sources should handle logic that creates the UUID for each event. This is a best practice to allow tracking down of individual events for further analysis or diagnosis.

---