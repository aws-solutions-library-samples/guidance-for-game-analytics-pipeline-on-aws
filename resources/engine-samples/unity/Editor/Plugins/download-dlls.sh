#!/usr/bin/env bash
# Downloads required AWS SDK for .NET DLLs for the GAP Unity Plugin.
# Usage: ./download-dlls.sh
#
# Prerequisites: curl, unzip
# Run from the Editor/Plugins/ directory, or the script will place DLLs next to itself.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR"
TEMP_DIR=$(mktemp -d)

NUGET_BASE_URL="https://www.nuget.org/api/v2/package"

# Packages: "name|version"
PACKAGES=(
    "AWSSDK.Core|3.7.400.26"
    "AWSSDK.SecurityToken|3.7.400.26"
    "AWSSDK.CloudFormation|3.7.400.26"
    "Microsoft.Bcl.AsyncInterfaces|8.0.0"
    "System.Runtime.CompilerServices.Unsafe|6.0.0"
    "System.Threading.Tasks.Extensions|4.5.4"
)

echo "=== GAP Unity Plugin — AWS SDK DLL Downloader ==="
echo ""
echo "Output directory: $OUTPUT_DIR"
echo ""

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

for ENTRY in "${PACKAGES[@]}"; do
    PACKAGE="${ENTRY%%|*}"
    VERSION="${ENTRY##*|}"
    URL="$NUGET_BASE_URL/$PACKAGE/$VERSION"
    NUPKG_FILE="$TEMP_DIR/$PACKAGE.$VERSION.nupkg"
    EXTRACT_DIR="$TEMP_DIR/$PACKAGE"

    echo "Downloading $PACKAGE v$VERSION..."
    curl -sL -o "$NUPKG_FILE" "$URL"

    echo "  Extracting..."
    mkdir -p "$EXTRACT_DIR"
    unzip -q -o "$NUPKG_FILE" -d "$EXTRACT_DIR"

    # Find the DLL in lib/netstandard2.0 or netstandard2.1
    DLL_NAME="$PACKAGE.dll"
    DLL_PATH=""

    if [ -f "$EXTRACT_DIR/lib/netstandard2.0/$DLL_NAME" ]; then
        DLL_PATH="$EXTRACT_DIR/lib/netstandard2.0/$DLL_NAME"
    elif [ -f "$EXTRACT_DIR/lib/netstandard2.1/$DLL_NAME" ]; then
        DLL_PATH="$EXTRACT_DIR/lib/netstandard2.1/$DLL_NAME"
    else
        # Search anywhere under lib/
        DLL_PATH=$(find "$EXTRACT_DIR/lib" -name "$DLL_NAME" 2>/dev/null | head -1)
    fi

    if [ -n "$DLL_PATH" ] && [ -f "$DLL_PATH" ]; then
        cp "$DLL_PATH" "$OUTPUT_DIR/"
        echo "  ✓ Copied $DLL_NAME"
    else
        echo "  ✗ ERROR: Could not find $DLL_NAME in package"
        if [ -d "$EXTRACT_DIR/lib" ]; then
            echo "    Available paths:"
            find "$EXTRACT_DIR/lib" -name "*.dll" 2>/dev/null | sed 's/^/      /'
        fi
    fi
    echo ""
done

echo "=== Done ==="
echo ""
echo "DLLs placed in: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Open Unity and wait for compilation (no errors in Console)"
echo "  2. Verify the Tools > Game Analytics Pipeline menu appears"
echo ""
echo "Note: DLLs under Editor/ are automatically excluded from player builds."
