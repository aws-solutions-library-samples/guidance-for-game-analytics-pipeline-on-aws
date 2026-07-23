# Store Click Event
```json
{
    "event_version": "1.0.0",
    "event_id": "34c74de5-69d9-4f06-86ac-4b98fef8bca9",
    "event_type": "store_click",
    "event_name": "store_click",
    "event_timestamp": 1737658977,
    "event_data": {
        "item": item, 
        "session_id": session_id
    },
    "app_version": "1.0.0",
}
```
This event tracks clickstream events when a user clicks or views an item in the in-game store. 

## Definitions

---
### `session_id`
- Type: `string`
- Description:
    - A random UUID identifier that uniquely identifies the session (game launch to game close) for the player.
---
### `item`
- Type: `string`
- Description:
    - A unique identifier for the store item that the user is viewing.
---
## Use Cases
- This can be used to track store engagement for a given product to A/B test product placement.
- When combined with purchase data, this can be used to track conversion rate from views to sale

# Store Purchase Event
```json
{
    "event_version": "1.0.0",
    "event_id": "34c74de5-69d9-4f06-86ac-4b98fef8bca9",
    "event_type": "store_purchase",
    "event_name": "store_purchase",
    "event_timestamp": 1737658977,
    "event_data": {
        "item": item, 
        "quantity": 1,
        "session_id": session_id
    },
    "app_version": "1.0.0",
}
```
This event tracks clickstream events when a user clicks or views an item in the in-game store. 

## Definitions

---
### `item`
- Type: `string`
- Description:
    - A unique identifier for the store item that the user is viewing.
---
### `quantity`
- Type: `integer`
- Description:
    - The quantity of the item that the user purchased in a given transaction
---
### `session_id`
- Type: `string`
- Description:
    - A random UUID identifier that uniquely identifies the session (game launch to game close) for the player.
---

## Use Cases
- This can be used to track sales data on a timed basis (revenue per day, revenue per month) and per-item
- When the session ID is tied to a user, this can track revenue per player and time to first monetization (time from first login event to first purchase event)