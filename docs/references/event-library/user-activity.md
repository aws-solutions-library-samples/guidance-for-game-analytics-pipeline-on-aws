# Login Event
```json
{
    "event_version": "1.0.0",
    "event_id": "34c74de5-69d9-4f06-86ac-4b98fef8bca9",
    "event_type": "user_login",
    "event_name": "user_login",
    "event_timestamp": 1737658977,
    "event_data": {
        "user_id": user_id, 
        "session_id": session_id
    },
    "app_version": "1.0.0",
}
```
This event tracks when a user logs in (opens the game). It should be sent at the beginning of the game session. 

## Definitions

---
### `user_id`
- Type: `string`
- Description:
    - A random identifier that uniquely identifies the player that is logging in to the game. 
---
### `session_id`
- Type: `string`
- Description:
    - A random UUID identifier that uniquely identifies the session (game launch to game close) for the player.
---

## Use Cases
- This can used to determine active players based on the timestamp of the login event for metrics such as daily active users (DAU) or monthly active users (MAU)
- Using user_id, this can be used to track per-user engagement and determine if a specific player is a new user or recurring user. This can track player acquisition, player retention, and active player loss.

# Logout Event
```json
{
    "event_version": "1.0.0",
    "event_id": "34c74de5-69d9-4f06-86ac-4b98fef8bca9",
    "event_type": "user_logout",
    "event_name": "user_logout",
    "event_timestamp": 1737658977,
    "event_data": {
        "user_id": user_id, 
        "session_id": session_id
    },
    "app_version": "1.0.0",
}
```
This event tracks when a user logs out and can be sent as a part of a game shutdown process. 

## Definitions

---
### `user_id`
- Type: `string`
- Description:
    - A random identifier that uniquely identifies the player that is exiting to the game. 
---
### `session_id`
- Type: `string`
- Description:
    - A random UUID identifier that uniquely identifies the session (game launch to game close) for the player.
---

## Use Cases
- When combined with login events, the logout event can provide insights on playtime for the given session.