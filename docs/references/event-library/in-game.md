# Item Action Event
```json
{
    "event_version": "1.0.0",
    "event_id": "34c74de5-69d9-4f06-86ac-4b98fef8bca9",
    "event_type": "item_action",
    "event_name": "item_action",
    "event_timestamp": 1737658977,
    "event_data": {
        "item": item_id,
        "action": action_type
    },
    "app_version": "1.0.0",
}
```
This event tracks actions performed on in-game items, such as using, crafting, trading, or other item-related activities.

## Definitions

---
### `item`
- Type: `string`
- Description:
    - A unique identifier for the item that the action is being performed on.
---
### `action`
- Type: `string`
- Description:
    - The type of action performed on the item. Common values include:
        - `used` - Item was consumed or used
        - `crafted` - Item was created through crafting
        - `equipped` - Item was equipped by the player
        - `traded` - Item was exchanged with another item (requires `recieved_item` field)
---

## Use Cases
- Track item usage patterns to understand which items are most popular or valuable to players
- Analyze crafting behavior to balance game economy and resource requirements
- Monitor equipment usage to inform item design and progression systems
- Track item trade flows between items to understand player economy and item exchange patterns
- Identify item-related bottlenecks or pain points in the player journey

# Item Trade Event
```json
{
    "event_version": "1.0.0",
    "event_id": "34c74de5-69d9-4f06-86ac-4b98fef8bca9",
    "event_type": "item_action",
    "event_name": "item_action",
    "event_timestamp": 1737658977,
    "event_data": {
        "item": traded_item_id,
        "action": "traded",
        "recieved_item": received_item_id
    },
    "app_version": "1.0.0",
}
```
This is a specialized form of the item_action event specifically for tracking item trades. It is sent when a player exchanges one item for another.

## Definitions

---
### `item`
- Type: `string`
- Description:
    - A unique identifier for the item that was traded away (given up by the player).
---
### `action`
- Type: `string`
- Description:
    - Always set to `traded` for trade events.
---
### `recieved_item`
- Type: `string`
- Description:
    - A unique identifier for the item that the player received in the trade.
    - Note: The spelling "recieved" is intentional to match the event schema.
---

## Use Cases
- Track item exchange patterns to understand the player-driven economy
- Identify popular trade routes and item conversion paths
- Analyze trading behavior to detect imbalances in item values
- Build trade flow visualizations (sankey diagrams) showing how items move between types
- Inform game balancing decisions based on actual player trading behavior

## Implementation Notes

The item_action event supports multiple action types through a single event schema. When implementing:

1. **Action Types**: Define a consistent set of action types in your game design document to ensure standardized tracking across all game events.

2. **Trade Events**: For trade actions, always include both the `item` (what was traded away) and `recieved_item` (what was received) fields to enable trade flow analysis.

3. **Optional Fields**: Fields like `recieved_item` should only be included when relevant to the action type. This keeps event payloads lean while maintaining flexibility.

4. **Item Identifiers**: Use consistent item identifiers across all events (item_action, store_purchase, etc.) to enable cross-event analysis of item lifecycle.
