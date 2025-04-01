The solution configures the following JSON schema to validate telemetry data sent to the solution API. To see how the solution utilizes the JSON schema during the event process, see [Component Deep Dive](../component-deep-dive.md) for details on the process.

!!! Info
    The `application_id` field is not required when sending events using the
    solution API events endpoint because it is automatically set in the data record by the
    API using the path of the API request after the request has been
    authorized. Applications that integrate directly with Amazon Kinesis Data Streams
    must provide an `application_id` for each event that is submitted.

There are sample queries built into the solution that you can refer to in [Customizations](../customizations.md). There are also sample scripts that create sample events built into the solution that you can utilize and refer to in [Getting Started](../getting-started.md).

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

### `event_name`
- Type: `string`
- Description:
    - An identifier for the event that identifies what kind of event is being passed in.

---
### `event_type`
- Type: `string`
- Description:
    - A grouping for event names that allows categorization of common events within a type.

---

### `event_version`
- Type: `string`
- Description:
    - The version of the event's schema, allows organizing events by their version as the schema evolves over time.

---

### `event_timestamp`
- Type: `number`
- Description:
    - The time in seconds since the Unix epoch at which this event occurred, set by the producer of event.

---

### `app_version`
- Type: `number`
- Description:
    - The version of the application/game, allows organizing events by the application/game's version as it updates over time.

---

### `event_data`
- Type: `json`
- Description:
    - Nested json blob that contains the event's specific schema values. The above top level schema reflects values that all events should have, while the values in `event_data` are specific to the event.

---