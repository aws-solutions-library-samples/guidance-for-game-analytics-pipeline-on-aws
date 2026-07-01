# Changelog

All notable changes to the AWS Game Analytics Pipeline Unity Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-01

### Added
- Initial release of the GAP Unity Plugin
- `GAPClient` runtime MonoBehaviour for queuing and sending batched events
- `GAPInitializer` auto-initializes the client on scene load via `RuntimeInitializeOnLoadMethod`
- `GAPRuntimeConfig` ScriptableObject baked into builds by the build processor
- `GAPSettings` editor-only ScriptableObject for storing credentials and configuration
- `GAPSettingsProvider` Project Settings UI panel
- `GAPQuickSetupWindow` wizard for discovering GAP stacks and creating applications/API keys
- `GAPBuildProcessor` stamps `GAPRuntimeConfig` at build time and optionally auto-creates applications
- `GAPConnectionTester` for testing connectivity and performing admin operations via SigV4-signed requests
- `GAPCloudFormationDiscovery` for discovering deployed GAP stacks in a region
- `AWSCredentialHelper` supporting Default/Environment, named Profile, and Explicit credential modes
- Editor Play Mode analytics with configurable app_version override and event source tagging
- `app_version` stamped on every event from Player Settings at build time
