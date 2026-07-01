# Quick Start Guide

Get up and running with the Game Analytics Pipeline Unity Plugin in 5 minutes.

## Prerequisites

- Unity 2019.1 or later
- AWS Game Analytics Pipeline deployed ([deployment guide](../guidance-for-game-analytics-pipeline-on-aws/docs/getting-started.md))
- AWS credentials configured (any of: `aws configure`, `aws sso login`, environment variables, or IAM access keys)

## Step 1: Install the Plugin

Copy the `GAPUnityPlugin` folder to your Unity project's `Assets` folder. See [INSTALLATION.md](INSTALLATION.md) for details.

## Step 2: Quick Setup

1. In Unity, go to **Tools > Game Analytics Pipeline > Quick Setup**
2. Select your credential mode:
   - **Default/Environment** — if you've run `aws configure` or have env vars set
   - **Profile** — pick a named profile from `~/.aws/credentials`
   - **Explicit** — enter access key / secret key manually
3. Select your AWS region and click **Find GAP Stacks**
4. The plugin discovers your deployed stack and fills in the API endpoint
5. Enter your game name and click **Create App + API Key**
6. Click **Test Connection** to verify
7. Done!

## Step 3: Track Events in Your Game

```csharp
using GAP;
using System.Collections.Generic;

public class MyGameScript : MonoBehaviour
{
    void Start()
    {
        // Track a simple event
        GAPClient.Instance.TrackEvent("game_started");
        
        // Track an event with data
        var eventData = new Dictionary<string, object>
        {
            { "level", 1 },
            { "character", "warrior" }
        };
        GAPClient.Instance.TrackEvent("level_started", eventData);
    }
    
    void OnPlayerDeath()
    {
        var eventData = new Dictionary<string, object>
        {
            { "level", currentLevel },
            { "score", playerScore },
            { "time_alive", Time.time }
        };
        GAPClient.Instance.TrackEvent("player_death", eventData);
    }
}
```

## Step 4: Verify Events in AWS

1. Wait a few minutes for events to process
2. Go to AWS Console > Athena (Data Lake mode) or Redshift (Redshift mode)
3. Query your events table

## Common Issues

| Issue | Solution |
|-------|----------|
| "API endpoint not configured" | Run Quick Setup or enter the endpoint in Project Settings |
| "Could not resolve AWS credentials" | Run `aws configure` or check your credential mode in settings |
| "No GAP stacks found" | Verify the region matches where GAP is deployed |
| 403 Forbidden | Your IAM identity needs the `{WORKLOAD_NAME}-AdminAPIAccess` policy |
| Events not appearing | Wait 5-10 minutes; check Application ID and API Key are set |

## Manual Configuration (Alternative)

If you prefer not to use Quick Setup:

1. Go to **Edit > Project Settings > Game Analytics Pipeline**
2. Set **API Endpoint** (from CloudFormation outputs: `CentralizedGameAnalytics.ApiEndpoint`)
3. Set **Credential Mode** and configure credentials
4. Set **AWS Region**
5. Go to **Tools > Game Analytics Pipeline > Create Application**

## Security Notes

- AWS credentials are editor-only — never included in player builds
- Only API endpoint, Application ID, and API Key ship in builds
- The API key is validated by a Lambda authorizer and scoped to event ingestion only
- Rotate API keys regularly via the GAP admin API

## Next Steps

- [Full README](README.md) for advanced features
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for technical details
- [INSTALLATION.md](INSTALLATION.md) for alternative install methods
