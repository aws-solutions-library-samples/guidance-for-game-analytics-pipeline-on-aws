<#
.SYNOPSIS
    Downloads required AWS SDK for .NET DLLs for the GAP Unity Plugin.
.DESCRIPTION
    Run this script from the Editor/Plugins/ directory.
    It downloads NuGet packages and extracts the netstandard2.0 DLLs.
.EXAMPLE
    .\download-dlls.ps1
#>

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$OutputDir = $ScriptDir
$TempBase = [System.IO.Path]::GetTempPath()
$TempDir = Join-Path $TempBase ("gap-dlls-" + [System.Guid]::NewGuid().ToString("N").Substring(0, 8))

$NuGetBaseUrl = "https://www.nuget.org/api/v2/package"

$Packages = @(
    @{ Name = "AWSSDK.Core"; Version = "3.7.400.26" },
    @{ Name = "AWSSDK.SecurityToken"; Version = "3.7.400.26" },
    @{ Name = "AWSSDK.CloudFormation"; Version = "3.7.400.26" },
    @{ Name = "Microsoft.Bcl.AsyncInterfaces"; Version = "8.0.0" },
    @{ Name = "System.Runtime.CompilerServices.Unsafe"; Version = "6.0.0" },
    @{ Name = "System.Threading.Tasks.Extensions"; Version = "4.5.4" }
)

Write-Host "=== GAP Unity Plugin - AWS SDK DLL Downloader ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output directory: $OutputDir"
Write-Host ""

New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

$SuccessCount = 0
$FailCount = 0

try {
    foreach ($Pkg in $Packages) {
        $PkgName = $Pkg.Name
        $PkgVersion = $Pkg.Version
        $Url = "$NuGetBaseUrl/$PkgName/$PkgVersion"
        $ZipFile = Join-Path $TempDir "$PkgName.$PkgVersion.zip"
        $ExtractDir = Join-Path $TempDir $PkgName

        Write-Host "Downloading $PkgName v$PkgVersion..."

        try {
            $wc = New-Object System.Net.WebClient
            $wc.DownloadFile($Url, $ZipFile)
            $wc.Dispose()
        }
        catch {
            Write-Host "  x ERROR downloading: $($_.Exception.Message)" -ForegroundColor Red
            $FailCount++
            continue
        }

        Write-Host "  Extracting..."
        New-Item -ItemType Directory -Path $ExtractDir -Force | Out-Null

        try {
            Expand-Archive -Path $ZipFile -DestinationPath $ExtractDir -Force
        }
        catch {
            try {
                Add-Type -AssemblyName System.IO.Compression.FileSystem
                [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipFile, $ExtractDir)
            }
            catch {
                Write-Host "  x ERROR extracting: $($_.Exception.Message)" -ForegroundColor Red
                $FailCount++
                continue
            }
        }

        $DllName = "$PkgName.dll"
        $DllPath = $null

        $Candidate = Join-Path $ExtractDir "lib\netstandard2.0\$DllName"
        if (Test-Path $Candidate) {
            $DllPath = $Candidate
        }

        if (-not $DllPath) {
            $Candidate = Join-Path $ExtractDir "lib\netstandard2.1\$DllName"
            if (Test-Path $Candidate) {
                $DllPath = $Candidate
            }
        }

        if (-not $DllPath) {
            $LibDir = Join-Path $ExtractDir "lib"
            if (Test-Path $LibDir) {
                $Found = Get-ChildItem -Path $LibDir -Filter $DllName -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                if ($Found) {
                    $DllPath = $Found.FullName
                }
            }
        }

        if ($DllPath -and (Test-Path $DllPath)) {
            Copy-Item $DllPath -Destination $OutputDir -Force
            Write-Host "  + Copied $DllName" -ForegroundColor Green
            $SuccessCount++
        }
        else {
            Write-Host "  x ERROR: Could not find $DllName in package" -ForegroundColor Red
            $FailCount++
        }
        Write-Host ""
    }
}
finally {
    Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}

Write-Host "=== Done ($SuccessCount succeeded, $FailCount failed) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "DLLs placed in: $OutputDir"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Open Unity and wait for compilation (no errors in Console)"
Write-Host "  2. Verify the Tools > Game Analytics Pipeline menu appears"
Write-Host ""
Write-Host "Note: DLLs under Editor/ are automatically excluded from player builds."

if ($FailCount -gt 0) {
    exit 1
}
