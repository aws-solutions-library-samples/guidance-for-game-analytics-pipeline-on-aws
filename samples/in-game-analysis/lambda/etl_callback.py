"""Hands a finished Redshift Data API statement back to the waiting Step Functions task.

The state machine puts its task token in the statement name (after STATEMENT_PREFIX).
EventBridge delivers the "Redshift Data Statement Status Change" event here.
"""
import json
import os

import boto3

PREFIX = os.environ["STATEMENT_PREFIX"]
sfn = boto3.client("stepfunctions")


def handler(event, context):
    detail = event["detail"]
    name = detail.get("statementName", "")
    if not name.startswith(PREFIX):
        return
    token = name[len(PREFIX):]
    state = detail["state"]
    try:
        if state == "FINISHED":
            output = {"StatementId": detail["statementId"], "Status": state}
            sfn.send_task_success(taskToken=token, output=json.dumps(output))
        else:
            # The event carries no error text and only the principal that ran a
            # statement may describe it, so pass the statement ID to the state
            # machine, which fetches the error itself.
            sfn.send_task_failure(taskToken=token, error="RedshiftStatementFailed", cause=detail["statementId"])
    except (sfn.exceptions.TaskTimedOut, sfn.exceptions.TaskDoesNotExist, sfn.exceptions.InvalidToken) as err:
        # The execution already timed out, was stopped or finished; retrying cannot help.
        print(f"Ignoring event for a task that is no longer waiting: {err}")
