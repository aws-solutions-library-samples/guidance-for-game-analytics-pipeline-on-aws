import random
import datetime
import uuid
import argparse
import requests
from math import ceil

# Event Payload defaults
DEFAULT_EVENT_VERSION = "1.0.0"
DATE_FORMAT = "%Y-%m-%d"
# used to determine how many of each user bucket to select
NEW_USER_PROPENSITY = 0.1
ACTIVE_USER_PROPENSITY = 0.5
DORMANT_USER_PROPENSITY = 0.2


def parse_cmd_line():
    """Parse the command line and extract the necessary values."""

    parser = argparse.ArgumentParser(
        description="Send data to a the Game Analytics Pipeline. By default, the script "
        "will send events infinitely. If an input file is specified, the "
        "script will instead read and transmit all of the events contained "
        "in the file and then terminate."
    )

    # REQUIRED arguments
    parser.add_argument(
        "--api-path",
        required=True,
        type=str,
        dest="api_path",
        help="The API base path to use when submitting events to the pipeline. There should be no trailing slash (/).",
    )

    parser.add_argument(
        "--api-key",
        required=True,
        type=str,
        dest="api_key",
        help="The value of the API key used to authorize events sent to the stream.",
    )

    parser.add_argument(
        "--application-id",
        required=True,
        type=str,
        dest="application_id",
        help="The application_id to use when submitting events to ths stream (i.e. You can use the default application for testing).",
    )
    # OPTIONAL arguments
    parser.add_argument(
        "--start",
        type=str,
        dest="start",
        default=None,
        help="The start date to send events from in the format yyyy-mm-dd",
    )
    parser.add_argument(
        "--end",
        type=str,
        dest="end",
        default=None,
        help="The end date for the events in the format yyyy-mm-dd",
    )
    parser.add_argument(
        "--users",
        type=int,
        dest="users",
        default=100000,
        help="The number of users to simulate",
    )
    return parser.parse_args()


ITEMS = [
    "Silver Shard",
    "Mana Potion",
    "Health Potion",
    "Gold Coin",
    "Sword of Data",
    "Helm of Cloud",
    "Boots of Speed",
]
ACTIONS = [
    "consumed",
    "crafted",
    "customized",
    "dropped",
    "equipped",
    "leveled up",
    "picked up",
    "scrapped",
    "sold",
    "traded",
]

SESSION_ACTIONS = [
    "item_action",
    "store_click",
    "store_purchase",
]

SESSION_ACTION_WEIGHTS = [0.8, 0.15, 0.05]


def format_event(event_type: str, event_data: dict, timestamp: int):
    return {
        "event_version": DEFAULT_EVENT_VERSION,
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "event_name": event_type,
        "event_timestamp": timestamp,
        "event_data": event_data,
        "app_version": str(
            random.choices(
                ["1.0.0", "1.1.0", "1.2.0"], k=1, weights=[0.05, 0.80, 0.15]
            )[0]
        ),
    }


# Simulate what happens from login to logout for a user
def session_simulator(user_id, date: datetime.date) -> list[dict]:
    events = []
    start_time = datetime.time(
        random.randint(0, 23), random.randint(0, 59), random.randint(0, 59)
    )
    running_timestamp = datetime.datetime.combine(date, start_time)
    session_id = str(uuid.uuid4())
    # log in and start session
    events.append(
        format_event(
            "user_login",
            {"user_id": user_id, "session_id": session_id},
            int(running_timestamp.timestamp()),
        )
    )
    # do a random number of in-game events
    game_event_count = random.randint(10, 200)
    for _ in range(game_event_count):
        running_timestamp = running_timestamp + datetime.timedelta(
            minutes=random.randint(1, 5), seconds=random.randint(0, 60)
        )
        item = random.choice(ITEMS)
        action = random.choices(SESSION_ACTIONS, weights=SESSION_ACTION_WEIGHTS, k=1)[0]
        if action == "item_action":
            item_action = random.choice(ACTIONS)
            if item_action == "traded":
                events.append(
                    format_event(
                        action,
                        {
                            "action": "traded",
                            "item": item,
                            "recieved_item": random.choices(ITEMS, k=1)[0],
                            "session_id": session_id,
                        },
                        int(running_timestamp.timestamp()),
                    )
                )
            else:
                events.append(
                    format_event(
                        action,
                        {"action": "consumed", "item": item, "session_id": session_id},
                        int(running_timestamp.timestamp()),
                    )
                )

        elif action == "store_click":
            events.append(
                format_event(
                    action,
                    {"item": item, "session_id": session_id},
                    int(running_timestamp.timestamp()),
                )
            )
        elif action == "store_purchase":
            # need to click before they buy
            events.append(
                format_event(
                    "store_click",
                    {"item": item, "session_id": session_id},
                    int(running_timestamp.timestamp()),
                )
            )
            running_timestamp = running_timestamp + datetime.timedelta(
                seconds=random.randint(0, 60)
            )
            events.append(
                format_event(
                    action,
                    {
                        "item": item,
                        "quantity": random.randint(1, 10),
                        "session_id": session_id,
                    },
                    int(running_timestamp.timestamp()),
                )
            )
    # log out
    events.append(
        format_event(
            "user_logout",
            {"user_id": user_id, "session_id": session_id},
            int(running_timestamp.timestamp()),
        )
    )
    return events


def send_record_batch(api_path, api_key, raw_records):
    """Send a batch of records to Amazon Kinesis."""

    # Translate input records into the format needed by API
    payload = {"events": raw_records}
    headers = {"Content-Type": "application/json", "Authorization": api_key}

    response = requests.post(api_path, json=payload, headers=headers)
    if response.status_code == 200:
        print(f"Successfully sent {len(raw_records)} records to endpoint {api_path}.")
    else:
        print(
            f"Failed to send events to endpoint {api_path} with status code {response.status_code}."
        )
        print(response.json())
        print(response.reason)


def simulate_user_activity(api_path, api_key, start_date, end_date, user_ids):
    """Simulate user session activity for that range"""
    # generate list of dates to simulate
    dates_to_send = []
    date_delta = (end_date - start_date).days
    for i in range(date_delta):
        dates_to_send.append(start_date + datetime.timedelta(days=i))
    if len(dates_to_send) == 0:
        dates_to_send.append(start_date)
    # generate lists of user buckets
    new_users = user_ids  # user IDs that have never been used
    active_users = []  # users that were active the previous day
    dormant_users = []  # users not selected to simulate on the previous day
    for date in dates_to_send:
        selected_users = []
        # select users that will be active for the day
        new_selected_count = ceil(NEW_USER_PROPENSITY * len(new_users))
        new_selected = (
            random.randint(1, new_selected_count) if new_selected_count > 1 else 1
        )
        for _ in range(new_selected):
            upper_bound = len(new_users)
            if upper_bound == 0:
                break
            selected_users.append(new_users.pop(random.randint(0, upper_bound - 1)))
        active_selected_count = ceil(ACTIVE_USER_PROPENSITY * len(active_users))
        active_selected = (
            random.randint(1, active_selected_count) if active_selected_count > 1 else 1
        )
        for _ in range(active_selected):
            upper_bound = len(active_users)
            if upper_bound == 0:
                break
            selected_users.append(active_users.pop(random.randint(0, upper_bound - 1)))
        dormant_selected_count = ceil(NEW_USER_PROPENSITY * len(dormant_users))
        dormant_selected = (
            random.randint(1, dormant_selected_count)
            if dormant_selected_count > 1
            else 1
        )
        for _ in range(dormant_selected):
            upper_bound = len(dormant_users)
            if upper_bound == 0:
                break
            selected_users.append(dormant_users.pop(random.randint(0, upper_bound - 1)))
        # send a batch of events for each user for the day
        for user in selected_users:
            send_record_batch(api_path, api_key, session_simulator(user, date))
        # swap positions after the day
        dormant_users.extend(active_users)
        active_users = selected_users


def send_data(params):
    api_path = params["api_path"]
    api_key = params["api_key"]
    application_id = params["application_id"]
    start_date = (
        datetime.datetime.strptime(params["start"], DATE_FORMAT).date()
        if params["start"] is not None
        else datetime.datetime.now().date()
    )
    end_date = (
        datetime.datetime.strptime(params["end"], DATE_FORMAT).date()
        if params["end"] is not None
        else datetime.datetime.now().date()
    )
    # generate user IDs to simulate
    user_ids = [str(uuid.uuid4()) for _ in range(params["users"])]
    # omit trailing slash
    api_full_path = (
        f"{api_path}/applications/{application_id}/events"
        if api_path[-1] != "/"
        else f"{api_path}applications/{application_id}/events"
    )

    print("===========================================")
    print("CONFIGURATION PARAMETERS:")
    print("- FULL_API_PATH: " + api_full_path)
    print("- API_KEY: " + api_key)
    print("- APPLICATION_ID: " + application_id)
    print("===========================================\n")

    simulate_user_activity(api_full_path, api_key, start_date, end_date, user_ids)


if __name__ == "__main__":
    args = parse_cmd_line()
    send_data(vars(args))
