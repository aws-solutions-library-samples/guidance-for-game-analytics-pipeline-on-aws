using System;
using System.Collections.Generic;
using Amazon.Runtime;
using UnityEditor;
using UnityEngine;

namespace GAP.Editor
{
    /// <summary>
    /// Quick Setup wizard — discovers a GAP stack, creates an application + API key in one flow.
    /// </summary>
    public class GAPQuickSetupWindow : EditorWindow
    {
        // State
        private int _step = 0; // 0=creds, 1=discover, 2=create app, 3=done
        private string _statusMessage = "";
        private MessageType _statusType = MessageType.None;

        // Step 1 — Credentials
        private CredentialMode _credMode = CredentialMode.DefaultOrEnvironment;
        private string[] _profileNames = new string[0];
        private int _profileIndex = 0;
        private string _explicitAccessKey = "";
        private string _explicitSecretKey = "";
        private string _explicitSessionToken = "";

        // Region
        private static readonly string[] CommonRegions = new[]
        {
            "us-east-1", "us-east-2", "us-west-1", "us-west-2",
            "eu-west-1", "eu-west-2", "eu-central-1",
            "ap-southeast-1", "ap-southeast-2", "ap-northeast-1"
        };
        private int _regionIndex = 0;

        // Step 2 — Stack discovery
        private List<GAPStackInfo> _discoveredStacks = new List<GAPStackInfo>();
        private int _stackIndex = 0;
        private bool _isDiscovering = false;

        // Step 3 — App creation
        private string _appName = "";
        private string _appDescription = "";
        private bool _isCreating = false;
        private string _createdAppId = "";
        private string _createdApiKey = "";

        // Resolved credentials (kept across steps)
        private AWSCredentials _resolvedCreds;

        public static void ShowWindow()
        {
            var window = GetWindow<GAPQuickSetupWindow>("GAP Quick Setup");
            window.minSize = new Vector2(480, 420);
            window._profileNames = AWSCredentialHelper.ListProfiles();

            // Pre-fill from existing settings
            var settings = GAPSettings.GetOrCreateSettings();
            window._credMode = settings.credentialMode;
            window._regionIndex = Array.IndexOf(CommonRegions, settings.awsRegion);
            if (window._regionIndex < 0) window._regionIndex = 0;

            // Restore profile selection
            if (settings.credentialMode == CredentialMode.Profile
                && !string.IsNullOrEmpty(settings.awsProfile)
                && window._profileNames.Length > 0)
            {
                int idx = Array.IndexOf(window._profileNames, settings.awsProfile);
                window._profileIndex = idx >= 0 ? idx : 0;
            }

            // Restore explicit credentials
            if (settings.credentialMode == CredentialMode.Explicit)
            {
                window._explicitAccessKey = settings.awsAccessKey ?? "";
                window._explicitSecretKey = settings.awsSecretKey ?? "";
                window._explicitSessionToken = settings.awsSessionToken ?? "";
            }

            // Restore app name / description (fall back to product name if empty)
            window._appName = !string.IsNullOrEmpty(settings.applicationName)
                ? settings.applicationName
                : Application.productName;
            window._appDescription = !string.IsNullOrEmpty(settings.applicationDescription)
                ? settings.applicationDescription
                : $"Analytics for {Application.productName}";

            // Restore completed-setup state so the summary step reappears
            if (!string.IsNullOrEmpty(settings.applicationId))
            {
                window._createdAppId = settings.applicationId;
                window._createdApiKey = settings.apiKey ?? "";
                window._step = 3;
            }

            window.Show();
        }

        private void OnGUI()
        {
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("Game Analytics Pipeline — Quick Setup", EditorStyles.boldLabel);
            EditorGUILayout.Space(4);

            DrawStep1_Credentials();
            EditorGUILayout.Space(6);
            DrawStep2_DiscoverStack();
            EditorGUILayout.Space(6);
            DrawStep3_CreateApp();
            EditorGUILayout.Space(6);
            DrawStep4_Summary();

            // Status bar
            if (!string.IsNullOrEmpty(_statusMessage))
            {
                EditorGUILayout.Space(8);
                EditorGUILayout.HelpBox(_statusMessage, _statusType);
            }
        }

        // ---- Step 1: Credentials ----

        private void DrawStep1_Credentials()
        {
            EditorGUILayout.LabelField("1. AWS Credentials", EditorStyles.boldLabel);

            _credMode = (CredentialMode)EditorGUILayout.EnumPopup("Credential Mode", _credMode);

            switch (_credMode)
            {
                case CredentialMode.Profile:
                    EditorGUILayout.BeginHorizontal();
                    if (_profileNames.Length > 0)
                    {
                        _profileIndex = EditorGUILayout.Popup("Profile", _profileIndex, _profileNames);
                    }
                    else
                    {
                        EditorGUILayout.HelpBox("No profiles found.", MessageType.Warning);
                    }
                    if (GUILayout.Button("Refresh", GUILayout.Width(70)))
                    {
                        _profileNames = AWSCredentialHelper.ListProfiles();
                    }
                    EditorGUILayout.EndHorizontal();
                    break;

                case CredentialMode.Explicit:
                    _explicitAccessKey = EditorGUILayout.TextField("Access Key", _explicitAccessKey);
                    _explicitSecretKey = EditorGUILayout.PasswordField("Secret Key", _explicitSecretKey);
                    _explicitSessionToken = EditorGUILayout.TextField("Session Token (optional)", _explicitSessionToken);
                    break;

                case CredentialMode.DefaultOrEnvironment:
                    EditorGUILayout.HelpBox("Will use environment variables or default profile.", MessageType.None);
                    break;
            }

            _regionIndex = EditorGUILayout.Popup("Region", _regionIndex, CommonRegions);
        }

        // ---- Step 2: Discover Stack ----

        private void DrawStep2_DiscoverStack()
        {
            EditorGUILayout.LabelField("2. Discover GAP Stack", EditorStyles.boldLabel);

            GUI.enabled = !_isDiscovering;
            if (GUILayout.Button(_isDiscovering ? "Searching..." : "Find GAP Stacks"))
            {
                DiscoverStacks();
            }
            GUI.enabled = true;

            if (_discoveredStacks.Count > 0)
            {
                var stackNames = new string[_discoveredStacks.Count];
                for (int i = 0; i < _discoveredStacks.Count; i++)
                    stackNames[i] = $"{_discoveredStacks[i].StackName} ({_discoveredStacks[i].ApiEndpoint})";

                _stackIndex = EditorGUILayout.Popup("Stack", _stackIndex, stackNames);

                EditorGUILayout.LabelField("API Endpoint", _discoveredStacks[_stackIndex].ApiEndpoint);
            }
            else if (_step >= 1)
            {
                EditorGUILayout.HelpBox("No GAP stacks found in this region.", MessageType.Warning);
            }
        }

        // ---- Step 3: Create Application ----

        private void DrawStep3_CreateApp()
        {
            EditorGUILayout.LabelField("3. Create Application", EditorStyles.boldLabel);

            GUI.enabled = _discoveredStacks.Count > 0 && !_isCreating;

            _appName = EditorGUILayout.TextField("Application Name", _appName);
            _appDescription = EditorGUILayout.TextField("Description", _appDescription);

            if (GUILayout.Button(_isCreating ? "Creating..." : "Create App + API Key"))
            {
                CreateApplicationAndKey();
            }
            GUI.enabled = true;
        }

        // ---- Step 4: Summary ----

        private void DrawStep4_Summary()
        {
            if (string.IsNullOrEmpty(_createdAppId)) return;

            EditorGUILayout.LabelField("4. Setup Complete", EditorStyles.boldLabel);
            EditorGUILayout.LabelField("Application ID", _createdAppId);
            EditorGUILayout.LabelField("API Key", string.IsNullOrEmpty(_createdApiKey) ? "(not created)" : "✓ Saved to settings");

            EditorGUILayout.Space(4);
            if (GUILayout.Button("Test Connection"))
            {
                RunConnectionTest();
            }

            if (GUILayout.Button("Done — Close"))
            {
                Close();
            }
        }

        // ---- Actions ----

        private AWSCredentials ResolveCredentials()
        {
            Debug.Log($"[GAP:QuickSetup] Resolving credentials — mode: {_credMode}, region: {CommonRegions[_regionIndex]}");
            // Build a temporary settings-like object for resolution
            var settings = GAPSettings.GetOrCreateSettings();
            settings.credentialMode = _credMode;
            settings.awsRegion = CommonRegions[_regionIndex];

            switch (_credMode)
            {
                case CredentialMode.Profile:
                    settings.awsProfile = _profileNames.Length > 0 ? _profileNames[_profileIndex] : "";
                    break;
                case CredentialMode.Explicit:
                    settings.awsAccessKey = _explicitAccessKey;
                    settings.awsSecretKey = _explicitSecretKey;
                    settings.awsSessionToken = _explicitSessionToken;
                    break;
            }

            return AWSCredentialHelper.Resolve(settings);
        }

        private async void DiscoverStacks()
        {
            _isDiscovering = true;
            _discoveredStacks.Clear();
            _statusMessage = "Searching for GAP stacks...";
            _statusType = MessageType.Info;
            Repaint();

            Debug.Log($"[GAP:QuickSetup] DiscoverStacks — starting discovery in region '{CommonRegions[_regionIndex]}'");

            try
            {
                _resolvedCreds = ResolveCredentials();
                string region = CommonRegions[_regionIndex];
                _discoveredStacks = await GAPCloudFormationDiscovery.DiscoverStacks(_resolvedCreds, region);

                if (_discoveredStacks.Count > 0)
                {
                    _step = 1;
                    _stackIndex = 0;
                    _statusMessage = $"Found {_discoveredStacks.Count} GAP stack(s).";
                    _statusType = MessageType.Info;
                    Debug.Log($"[GAP:QuickSetup] DiscoverStacks — found {_discoveredStacks.Count} stack(s)");
                    for (int i = 0; i < _discoveredStacks.Count; i++)
                    {
                        Debug.Log($"[GAP:QuickSetup]   [{i}] {_discoveredStacks[i].StackName} — {_discoveredStacks[i].ApiEndpoint}");
                    }
                }
                else
                {
                    _step = 1;
                    _statusMessage = "No GAP stacks found in this region. Verify the region and credentials.";
                    _statusType = MessageType.Warning;
                    Debug.LogWarning("[GAP:QuickSetup] DiscoverStacks — no GAP stacks found");
                }
            }
            catch (Exception e)
            {
                _statusMessage = $"Discovery failed: {e.Message}";
                _statusType = MessageType.Error;
                Debug.LogError($"[GAP:QuickSetup] DiscoverStacks — exception: {e.GetType().Name}: {e.Message}\n{e.StackTrace}");
            }
            finally
            {
                _isDiscovering = false;
                Repaint();
            }
        }

        private void CreateApplicationAndKey()
        {
            if (_discoveredStacks.Count == 0) return;

            _isCreating = true;
            _statusMessage = "Creating application...";
            _statusType = MessageType.Info;
            Repaint();

            var stack = _discoveredStacks[_stackIndex];
            Debug.Log($"[GAP:QuickSetup] CreateApplicationAndKey — using stack '{stack.StackName}', endpoint: {stack.ApiEndpoint}");
            Debug.Log($"[GAP:QuickSetup] CreateApplicationAndKey — appName: '{_appName}', description: '{_appDescription}'");
            var settings = GAPSettings.GetOrCreateSettings();

            // Persist credential + endpoint settings
            settings.credentialMode = _credMode;
            settings.awsRegion = CommonRegions[_regionIndex];
            settings.apiEndpoint = stack.ApiEndpoint;

            if (_credMode == CredentialMode.Profile && _profileNames.Length > 0)
                settings.awsProfile = _profileNames[_profileIndex];
            if (_credMode == CredentialMode.Explicit)
            {
                settings.awsAccessKey = _explicitAccessKey;
                settings.awsSecretKey = _explicitSecretKey;
                settings.awsSessionToken = _explicitSessionToken;
            }

            settings.applicationName = _appName;
            settings.applicationDescription = _appDescription;
            EditorUtility.SetDirty(settings);

            if (_resolvedCreds == null)
            {
                try { _resolvedCreds = ResolveCredentials(); }
                catch (Exception e)
                {
                    _statusMessage = $"Credential error: {e.Message}";
                    _statusType = MessageType.Error;
                    _isCreating = false;
                    Repaint();
                    return;
                }
            }

            GAPAdminClient.CreateApplication(settings, _resolvedCreds,
                _appName, _appDescription,
                (success, message, appId) =>
                {
                    if (success)
                    {
                        _createdAppId = appId;
                        settings.applicationId = appId;
                        EditorUtility.SetDirty(settings);

                        _statusMessage = "Application created. Creating API key...";
                        Repaint();

                        GAPAdminClient.CreateAPIKey(settings, _resolvedCreds,
                            appId, $"{_appName} Key", "Created via Quick Setup",
                            (keySuccess, keyMsg, apiKey) =>
                            {
                                _isCreating = false;
                                if (keySuccess)
                                {
                                    _createdApiKey = apiKey;
                                    settings.apiKey = apiKey;
                                    EditorUtility.SetDirty(settings);
                                    AssetDatabase.SaveAssets();
                                    _step = 3;
                                    _statusMessage = "Setup complete! Application and API key created.";
                                    _statusType = MessageType.Info;
                                }
                                else
                                {
                                    AssetDatabase.SaveAssets();
                                    _step = 3;
                                    _statusMessage = $"Application created but API key failed: {keyMsg}";
                                    _statusType = MessageType.Warning;
                                }
                                Repaint();
                            });
                    }
                    else
                    {
                        _isCreating = false;
                        _statusMessage = $"Failed to create application: {message}";
                        _statusType = MessageType.Error;
                        Repaint();
                    }
                });
        }

        private void RunConnectionTest()
        {
            var settings = GAPSettings.GetOrCreateSettings();
            if (_resolvedCreds == null)
            {
                try { _resolvedCreds = ResolveCredentials(); }
                catch (Exception e)
                {
                    _statusMessage = $"Credential error: {e.Message}";
                    _statusType = MessageType.Error;
                    Repaint();
                    return;
                }
            }

            GAPConnectionTester.TestConnection(settings, (success, message) =>
            {
                _statusMessage = success
                    ? "✓ Connection test passed!"
                    : $"✗ Connection test failed: {message}";
                _statusType = success ? MessageType.Info : MessageType.Error;
                Repaint();
            });
        }
    }
}
