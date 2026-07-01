# Game Analytics Pipeline Unity Plugin

Unity plugin for integrating with AWS Game Analytics Pipeline (GAP).

## Features

- **Easy Configuration**: Configure GAP settings via Unity Project Settings
- **Auto-Initialization**: Automatically initializes on game start
- **Build Integration**: Auto-creates applications and API keys during build
- **AWS SigV4 Authentication**: Full implementation of AWS Signature Version 4
- **Event Tracking**: Simple API for tracking custom events
- **Batching**: Automatically batches events for efficient transmission
- **Editor Tools**: Menu items for testing connection and creating applications
- **Connection Testing**: Verify your configuration before deployment

## Installation

1. Copy the `GAPUnityPlugin` folder to your Unity project's `Assets` folder
2. Or install as a UPM package by adding to your `manifest.json`:
   ```json
   {
     "dependencies": {
       "com.aws.gap": "file:../path/to/GAPUnityPlugin"
     }
   }
   ```

## Configuration

1. Open **Edit > Project Settings > Game Analytics Pipeline**
2. Configure the following settings:
   - **API Endpoint**: Your GAP API endpoint URL (e.g., `https://abc123.execute-api.us-east-1.amazonaws.com/live`)
   - **Application ID**: (Optional) Existing application ID
   - **API Key**: (Optional) Existing API key
   - **AWS Credentials**: For auto-creating applications (Editor only)
     - Access Key ID
     - Secret Access Key
     - Region (e.g., `us-east-1`)
   - **Build Settings**: Configure auto-creation behavior

### Quick Setup

If you don't have an application yet:

1. Configure your API endpoint and AWS credentials
2. Go to **Tools > Game Analytics Pipeline > Create Application**
3. The plugin will automatically create an application and API key
4. Your settings will be saved and ready to use

Alternatively, use **Tools > Game Analytics Pipeline > Test Connection** to verify your credentials.

## Usage

### Automatic Initialization

The plugin automatically initializes when your game starts and tracks a `session_start` event.

### Manual Event Tracking

```csharp
using GAP;
using System.Collections.Generic;

// Track a simple event
GAPClient.Instance.TrackEvent("level_complete");

// Track an event with data
var eventData = new Dictionary<string, object>
{
    { "level", 5 },
    { "score", 1000 },
    { "time_seconds", 120.5f }
};
GAPClient.Instance.TrackEvent("level_complete", eventData);
```

### Common Event Examples

```csharp
// Player login
GAPClient.Instance.TrackEvent("player_login", new Dictionary<string, object>
{
    { "player_id", "12345" },
    { "login_method", "email" }
});

// In-app purchase
GAPClient.Instance.TrackEvent("iap_purchase", new Dictionary<string, object>
{
    { "item_id", "gold_pack_100" },
    { "price", 4.99f },
    { "currency", "USD" }
});

// Game crash
GAPClient.Instance.TrackEvent("game_crash", new Dictionary<string, object>
{
    { "error_message", exception.Message },
    { "stack_trace", exception.StackTrace }
});
```

## Build Pipeline Integration

When **Auto Create Application** is enabled:

1. On build, the plugin checks if an Application ID exists
2. If not, it creates a new application in GAP using your AWS credentials
3. It then creates an API key for that application
4. Both values are saved to your settings and included in the build

**Note**: AWS credentials are only used in the Unity Editor and are NOT included in builds.

## Editor Tools

Access GAP tools via the **Tools > Game Analytics Pipeline** menu:

- **Create Application**: Manually create a new application and API key
- **Test Connection**: Verify your AWS credentials and API connectivity
- **Open Settings**: Quick access to Project Settings
- **Send Test Event**: Send a test event (requires Play Mode)

## Architecture

- **GAPSettings**: ScriptableObject storing configuration
- **GAPClient**: Runtime singleton for sending events
- **GAPInitializer**: Auto-initializes the client on game start
- **GAPBuildProcessor**: Handles build-time application creation
- **GAPSettingsProvider**: Project Settings UI
- **AWSSigV4Signer**: AWS Signature Version 4 implementation
- **GAPConnectionTester**: Utilities for testing API connectivity
- **GAPEditorMenu**: Editor menu items for common operations

## Security Notes

- AWS credentials are stored in the Unity Editor only
- Only the API endpoint, Application ID, and API Key are included in builds
- API keys should be rotated regularly via the GAP admin API
- Consider implementing additional security measures for production

## Prerequisites

### Download the Required AWS SDK DLLs

The plugin requires AWS SDK for .NET assemblies for editor-only operations. These are **not included** in the repository and must be downloaded manually.

For full instructions, see [`Editor/Plugins/README.md`](Editor/Plugins/README.md).

**Quick steps:** Run the included download script from `Editor/Plugins/`:

```bash
# Bash (Linux / macOS / WSL)
cd Editor/Plugins && ./download-dlls.sh
```

```powershell
# PowerShell (Windows)
cd Editor\Plugins; .\download-dlls.ps1
```

Or download manually from [nuget.org](https://www.nuget.org/) — rename `.nupkg` to `.zip`, extract the DLL from `lib/netstandard2.0/`, and place it in the `Editor/Plugins/` folder:

- `AWSSDK.Core.dll`
- `AWSSDK.SecurityToken.dll`
- `AWSSDK.CloudFormation.dll`
- `Microsoft.Bcl.AsyncInterfaces.dll`
- `System.Runtime.CompilerServices.Unsafe.dll`
- `System.Threading.Tasks.Extensions.dll`

For more information see [Special considerations for Unity support](https://docs.aws.amazon.com/sdk-for-net/v3/developer-guide/unity-special.html) and [Obtaining assemblies for the AWS SDK for .NET](https://docs.aws.amazon.com/sdk-for-net/v3/developer-guide/net-dg-obtain-assemblies.html).

## Requirements

- Unity 2019.1 or later
- AWS SDK for .NET DLLs (see Prerequisites above)
- AWS Game Analytics Pipeline deployed and accessible
- AWS credentials with permissions to create applications (for auto-creation)

## Troubleshooting 

### Events not sending
- Check that API Endpoint, Application ID, and API Key are configured
- Verify network connectivity
- Check Unity Console for error messages

### Build-time application creation fails
- Verify AWS credentials are correct
- Ensure IAM user has necessary permissions (attach the `{WORKLOAD_NAME}-AdminAPIAccess` policy)
- Check that API endpoint is accessible from your build machine
- Use **Tools > Game Analytics Pipeline > Test Connection** to diagnose issues
- Check Unity Console for detailed error messages


## License

See LICENSE file for details.
