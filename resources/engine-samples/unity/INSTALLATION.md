# Installation Guide

## Method 1: Direct Copy (Recommended for Testing)

### Steps:

1. **Locate your Unity project folder**
   - Find your Unity project on your computer
   - Navigate to the `Assets` folder

2. **Copy the plugin**
   - Copy the entire `GAPUnityPlugin` folder
   - Paste it into your Unity project's `Assets` folder
   
   Your structure should look like:
   ```
   YourUnityProject/
   ├── Assets/
   │   ├── GAPUnityPlugin/
   │   │   ├── Editor/
   │   │   │   ├── Plugins/              ← Download AWS SDK DLLs here (see below)
   │   │   │   │   └── README.md         ← Instructions for downloading DLLs
   │   │   │   ├── AWSCredentialHelper.cs
   │   │   │   ├── GAPBuildProcessor.cs
   │   │   │   ├── GAPCloudFormationDiscovery.cs
   │   │   │   ├── GAPConnectionTester.cs
   │   │   │   ├── GAPEditorMenu.cs
   │   │   │   ├── GAPQuickSetupWindow.cs
   │   │   │   ├── GAPSettings.cs
   │   │   │   └── GAPSettingsProvider.cs
   │   │   ├── Runtime/
   │   │   │   ├── GAPClient.cs
   │   │   │   └── GAPInitializer.cs
   │   │   ├── package.json
   │   │   └── README.md
   │   └── ... (your other assets)
   ```

3. **Wait for Unity to compile**
   - Unity will automatically detect the new scripts and DLLs
   - Wait for the compilation to finish

4. **Verify installation**
   - Check that **Tools > Game Analytics Pipeline** menu appears
   - Check that **Edit > Project Settings > Game Analytics Pipeline** is available

### AWS SDK DLLs (Required — Not Included)

The `Editor/Plugins/` folder requires AWS SDK for .NET assemblies for editor-only operations (credential resolution, SigV4 signing, CloudFormation stack discovery). **These DLLs are not included in the repository** and must be downloaded manually.

See [`Editor/Plugins/README.md`](Editor/Plugins/README.md) for detailed download instructions.

**Quick steps:**

1. Run the included download script from `Editor/Plugins/`:
   - **Bash (Linux / macOS / WSL):** `./download-dlls.sh`
   - **PowerShell (Windows):** `.\download-dlls.ps1`

   Or download each package manually from [nuget.org](https://www.nuget.org/):
   - Rename each `.nupkg` to `.zip`, extract the DLL from `lib/netstandard2.0/`, and place it in the `Editor/Plugins/` folder
2. Place the following DLLs in `Editor/Plugins/`:
   - `AWSSDK.Core.dll`
   - `AWSSDK.SecurityToken.dll`
   - `AWSSDK.CloudFormation.dll`
   - `Microsoft.Bcl.AsyncInterfaces.dll`
   - `System.Runtime.CompilerServices.Unsafe.dll`
   - `System.Threading.Tasks.Extensions.dll`

Since these DLLs are under an `Editor/` folder, Unity automatically excludes them from player builds — no manual platform configuration is needed.

For more information see [Special considerations for Unity support](https://docs.aws.amazon.com/sdk-for-net/v3/developer-guide/unity-special.html) and [Obtaining assemblies for the AWS SDK for .NET](https://docs.aws.amazon.com/sdk-for-net/v3/developer-guide/net-dg-obtain-assemblies.html).

---

## Method 2: Unity Package Manager (Local Package)

1. Place `GAPUnityPlugin` folder somewhere on your computer (outside Assets)
2. In Unity: **Window > Package Manager > + > Add package from disk...**
3. Select the `package.json` file
4. Verify the Tools menu and Project Settings appear

## Method 3: Unity Package Manager (Git URL)

1. Push the plugin to a Git repository with `package.json` at the root
2. In Unity: **Window > Package Manager > + > Add package from git URL...**
3. Enter your Git URL and click Add

---

## Post-Installation Setup

### Quick Setup (Recommended)

The fastest way to configure the plugin:

1. Go to **Tools > Game Analytics Pipeline > Quick Setup**
2. **Step 1 — Credentials**: Choose how to authenticate:
   - **Default/Environment**: Uses `~/.aws/credentials`, environment variables, or instance metadata. If you've already run `aws configure` or `aws sso login`, this just works.
   - **Profile**: Pick a named profile from `~/.aws/credentials` or `~/.aws/config`.
   - **Explicit**: Enter access key / secret key manually (legacy method).
3. **Step 2 — Discover Stack**: Select your AWS region and click "Find GAP Stacks". The plugin queries CloudFormation to find your deployed GAP stack and auto-populates the API endpoint.
4. **Step 3 — Create Application**: Enter your game name and click "Create App + API Key". The plugin creates an application and API key via the GAP admin API and saves them to settings.
5. **Step 4 — Verify**: Click "Test Connection" to confirm everything works.

### Manual Setup

If you prefer to configure manually:

1. Go to **Edit > Project Settings > Game Analytics Pipeline**
2. Set the **Credential Mode** and configure credentials
3. Enter your **API Endpoint** (from CloudFormation stack outputs)
4. Enter your **AWS Region**
5. Go to **Tools > Game Analytics Pipeline > Create Application** to create an app + API key
6. Or enter an existing **Application ID** and **API Key** manually

---

## AWS Credential Options

The plugin supports the standard AWS credential provider chain:

| Mode | Description | Best For |
|------|-------------|----------|
| **Default/Environment** | Reads from env vars (`AWS_ACCESS_KEY_ID`, etc.), `~/.aws/credentials` default profile, or instance metadata | Developers with `aws configure` set up, CI/CD |
| **Profile** | Reads a named profile from `~/.aws/credentials` or `~/.aws/config` | Multiple AWS accounts, SSO users |
| **Explicit** | Manual access key / secret key entry | Quick testing, legacy workflows |

For SSO profiles: run `aws sso login --profile <name>` in your terminal first, then select the profile in the plugin. The SDK reads cached SSO tokens automatically.

---

## Updating the Plugin

- **Direct Copy**: Delete the old folder, copy the new version
- **Local Package**: Update files in place; Unity auto-reloads
- **Git URL**: Update via Package Manager or re-add with new URL/tag

---

## Uninstalling

1. Delete the `GAPUnityPlugin` folder (or remove via Package Manager)
2. Optionally delete `Assets/Resources/GAPSettings.asset`

---

## Requirements

- Unity 2019.1 or later
- .NET 4.x or .NET Standard 2.0 scripting runtime
- Internet connection for API calls

---

## File Structure

### Editor Scripts (editor-only, not in builds):
- `AWSCredentialHelper.cs` — AWS credential chain resolution (profiles, env vars, SSO)
- `GAPBuildProcessor.cs` — Build pipeline integration
- `GAPCloudFormationDiscovery.cs` — CloudFormation stack discovery
- `GAPConnectionTester.cs` — Connection testing and admin API calls
- `GAPEditorMenu.cs` — Tools menu items
- `GAPQuickSetupWindow.cs` — Quick Setup wizard
- `GAPSettings.cs` — Settings ScriptableObject
- `GAPSettingsProvider.cs` — Project Settings UI
- `Plugins/*.dll` — AWS SDK for .NET assemblies

### Runtime Scripts (included in builds):
- `GAPClient.cs` — Event tracking client
- `GAPInitializer.cs` — Auto-initialization

---

## Next Steps

See [QUICK_START.md](QUICK_START.md) for usage examples and event tracking patterns.
