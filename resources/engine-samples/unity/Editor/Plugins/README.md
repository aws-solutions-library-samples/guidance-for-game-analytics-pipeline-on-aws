# AWS SDK DLLs for GAP Unity Plugin

This folder must contain the AWS SDK for .NET assemblies required for editor-only operations
(credential resolution, SigV4 signing, CloudFormation stack discovery).

**DLLs are not included in this repository.** You must download them manually.

## Download the Required .NET DLLs

When using the AWS SDK for .NET with Unity (.NET Standard 2.0), your application must reference
the AWS SDK assemblies (DLL files) directly rather than using NuGet.

For more information see:
- [Special considerations for Unity support](https://docs.aws.amazon.com/sdk-for-net/v3/developer-guide/unity-special.html)
- [Obtaining assemblies for the AWS SDK for .NET](https://docs.aws.amazon.com/sdk-for-net/v3/developer-guide/net-dg-obtain-assemblies.html)

### Option A: Automated Script (Recommended)

Run the included download script from this directory:

**Bash (Linux / macOS / WSL):**
```bash
chmod +x download-dlls.sh
./download-dlls.sh
```

**PowerShell (Windows):**
```powershell
.\download-dlls.ps1
```

The script downloads each package from NuGet, extracts the .NET Standard 2.0 DLL, and places it in this folder automatically.

### Option B: Manual Download from NuGet

You can obtain each DLL from [nuget.org](https://www.nuget.org/) by downloading the corresponding package:

1. Search for the package on nuget.org (e.g., `AWSSDK.Core`)
2. Download the `.nupkg` file
3. Rename the file extension from `.nupkg` to `.zip`
4. Extract the archive and locate the DLL in `lib/netstandard2.0/`
5. Copy the DLL into this `Editor/Plugins/` folder

### Option C: Download the SDK Bundle

1. Download `aws-sdk-netstandard2.0.zip` from the [AWS SDK for .NET releases](https://docs.aws.amazon.com/sdk-for-net/v3/developer-guide/net-dg-obtain-assemblies.html)
2. Extract and copy the required DLLs into this folder

## Required DLLs

Place the following DLLs in this `Editor/Plugins/` folder:

| DLL | NuGet Package | Purpose |
|-----|---------------|---------|
| `AWSSDK.Core.dll` | [AWSSDK.Core](https://www.nuget.org/packages/AWSSDK.Core) | Credential chain, SigV4 signing, HTTP client |
| `AWSSDK.SecurityToken.dll` | [AWSSDK.SecurityToken](https://www.nuget.org/packages/AWSSDK.SecurityToken) | STS AssumeRole, SSO token exchange |
| `AWSSDK.CloudFormation.dll` | [AWSSDK.CloudFormation](https://www.nuget.org/packages/AWSSDK.CloudFormation) | CloudFormation DescribeStacks |
| `Microsoft.Bcl.AsyncInterfaces.dll` | [Microsoft.Bcl.AsyncInterfaces](https://www.nuget.org/packages/Microsoft.Bcl.AsyncInterfaces) | Required support library |
| `System.Runtime.CompilerServices.Unsafe.dll` | [System.Runtime.CompilerServices.Unsafe](https://www.nuget.org/packages/System.Runtime.CompilerServices.Unsafe) | Required support library |
| `System.Threading.Tasks.Extensions.dll` | [System.Threading.Tasks.Extensions](https://www.nuget.org/packages/System.Threading.Tasks.Extensions) | Required support library |

## Platform Behavior

Since these DLLs are located under an `Editor/` folder, Unity **automatically excludes them from player builds** (mobile, WebGL, desktop). No manual platform configuration is needed.

## Verification

After placing the DLLs, verify the plugin works:
1. Open Unity and wait for compilation to finish (no errors in Console)
2. Confirm the **Tools > Game Analytics Pipeline** menu appears
3. Try **Tools > Game Analytics Pipeline > Test Connection**
