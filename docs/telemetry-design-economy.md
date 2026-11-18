# Game Telemetry Recommendations

## Purpose

This document outlines telemetry design recommendations for tracking and analysis of game currency and item economies.

## Concept Glossary

Currencies – player assets that are represented by a simple count of the currency in players' wallet, rather than inventory presence.  Currencies are gained and spent in amounts. Examples can include coins, basic resources, real-world money invested in the game wallet.

Stackable Items – identical, fungible items of which the player can have many, for example health boosters, potions, crafting materials.  Stackable items can be held in a single stack or divided into many stacks, or consumed/traded individually.

Non-stackable Items – unique items that are not interchangeable even if the player has many copies of the same item.  For example: weapons, armor pieces, personalized cosmetic items, quest items.  Reasons items are not interchangeable can include different wear conditions, customizations to the item, or weight/inventory capacity design constraints.

Transaction – an in-game occurrence where an item or resource is exchanged for another item or resource (traded, sold, scrapped, etc).  Example: player scraps 1 Helm of Cloud Practitioner for 30 Silicon Shards, or crafts 1 Sword of Streaming Data from 10 Silicon Shards, 5 Data Cubes and 1 Rare CloudFormation Template.



See [Telemetry Design Foundations](./telemetry-design-foundations.md) for more details.

## Non-Stackable Item Lifecycle Tracking

In games where players can acquire, create, use, modify, trade and dispose of items, it can be difficult to keep track of how different items are used, yet it is important for game balancing and content planning to do so.  This task can be simplified by treating each item instance as a persistent object, which will trigger telemetry events when different actions are performed to it.

This is example of a unique item's life in an MMORPG:

### Setup

For analyst convenience and speed of insight, all actions performed to an item, including creation and destruction can be tracked in a single event:

| Event Name | Field | Type | Example |
| --- | --- | --- | --- |
| item_lifecycle_action | <standard fields> |  | See Foundations. |
|  | item_guid | string | GUID identifying this item uniquely among all items in the universe. |
|  | Item_name | string | Human-readable unlocalized name of the item (internal or player-facing) for easy identification. |
|  | action | string | What action was performed? Examples: "crafted", "scrapped", "picked up", "leveled up", "customized", "equipped", "unequipped" |
|  | source | string | Where appropriate, describe where the item was picked up, collected or received from or disposed, sold, traded to.  Examples: "mission reward", "item store", trading player's pid if item was traded/sold. |
|  | transaction_id | String | GUID unique to this item action, but common to all items/resources involved in the transaction. |

To save gameplay engineering time, we recommend side-loading tables of metadata (full name, stats, rarity, etc) into your analytics platform via a separate process triggered off game build/release cycles or connected directly to the item database, if one exists.  The latter can be facilitated with connections between AWS database services.  This metadata can be used to segment items by design criteria to gather broad insight across all items of a type.

### Analysis

This event enables the following analyses, among others:

- Number of each item created in the world
- Number / percentage of all spawned items picked up by players (are players ignoring some items?)
- Number / percentage of all picked up items equipped (are players making use of items)
- Equipped item popularity (what are players equipping?)
- Player rationality (Are players equipping the best items in their inventory? Are players equipping the right gear for a given mission (assumes additional tracking of mission participation))
- Duration of item use
- Item scrapping stats (which items are players scrapping?)
- Exchange value of items in player trading

Answering the above questions will undoubtedly generate others, and analysts should be able to contextualize item actions further by tying to other events via keys in standard fields.

### Performance Considerations

Items can generate a large volume of events in a popular game, as the volume scales in players * average number of items per player.  We recommend setting up ETL to create aggregate tables to support stable, recurring monitoring metrics that will be reviewed regularly.  The raw events can still be used for deep dives.  Sampling telemetry from a percentage of items and server-side activation-deactivation of telemetry are good alternatives.

## Stackable Resource Lifecycle Tracking

Stackable items also experience lifetime events, but these are generally simpler and there is no distinction between 2 items of the same kind.  For example, as player picks up and consumes healing medpacks, it's not important to know exactly which medpack was consumed or how long it has been in the inventory.  The important design question is whether the player has enough medpacks to succeed in the game.

It's possible to use the item_lifecycle_action event for these types of items as well, but requiring a unique GUID creates unnecessary integration complexity for non-unique items.  Instead, we recommend a more general "resource_action" event that is focused on quantity of a given resource.

This event can also be used for currencies.

| Event Name | Field | Type | Example |
| --- | --- | --- | --- |
| resource_action | <standard fields> |  | See Foundations. |
|  | resource_name | string | Human-readable unlocalized name of the item (internal or player-facing) for easy identification. |
|  | action | string | What was done with the resource? Examples "crafted", "consumed", "dropped", "traded".. |
|  | balance | numeric | New balance of the resource in the player's inventory/wallet, following the action.  This is used to checksum long-term balance changes and hedge against integration issues where some item grants are not tracked. |
|  | change_amount | numeric | How many of the item/resource were gained or lost (usually integer) |
|  | source | string | Where appropriate, describe where the resource was picked up, collected or received from or disposed, sold, traded to.  Examples: "mission reward", "item store", trading player's pid if item was traded/sold. |
|  | transaction_guid | string | GUID unique to this item action, but common to all items/resources involved in the transaction. |

This event enables the following analyses, among others:

- Player balance of resources at any given time
- Used and unused resources as indicators of player engagement with specific features
- Ways players are gaining resources, potentially identifying exploits and min/max strategies
- Player resource investment choices, as indicator of player motivation and desire to progress toward goals
- Conditions where resource scarcity is a blocker to progression or creates difficulty
