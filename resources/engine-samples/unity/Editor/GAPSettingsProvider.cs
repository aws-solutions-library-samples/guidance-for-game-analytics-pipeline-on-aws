using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

namespace GAP.Editor
{
    /// <summary>
    /// Settings provider for GAP configuration in Project Settings
    /// </summary>
    public class GAPSettingsProvider : SettingsProvider
    {
        private SerializedObject _settings;
        private string[] _profileNames = new string[0];
        private int _selectedProfileIndex = -1;
        
        public GAPSettingsProvider(string path, SettingsScope scope = SettingsScope.Project)
            : base(path, scope) { }
        
        public override void OnActivate(string searchContext, VisualElement rootElement)
        {
            _settings = GAPSettings.GetSerializedSettings();
            RefreshProfiles();
        }
        
        public override void OnGUI(string searchContext)
        {
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Game Analytics Pipeline Configuration", EditorStyles.boldLabel);
            EditorGUILayout.Space();
            
            _settings.Update();
            
            // API Configuration
            EditorGUILayout.PropertyField(_settings.FindProperty("apiEndpoint"));

            var appId = _settings.FindProperty("applicationId").stringValue;
            EditorGUILayout.LabelField("Application Id", string.IsNullOrEmpty(appId) ? "(not set)" : appId);

            var apiKey = _settings.FindProperty("apiKey").stringValue;
            EditorGUILayout.LabelField("Api Key", string.IsNullOrEmpty(apiKey) ? "(not set)" : "✓ Configured");
            
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("AWS Credential Configuration", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Credentials are only used in the Unity Editor for admin operations (creating applications, " +
                "API keys, discovering stacks). They are NOT included in player builds.", MessageType.Info);
            
            // Credential Mode
            EditorGUILayout.PropertyField(_settings.FindProperty("credentialMode"));
            
            var mode = (CredentialMode)_settings.FindProperty("credentialMode").enumValueIndex;
            
            switch (mode)
            {
                case CredentialMode.Explicit:
                    EditorGUILayout.PropertyField(_settings.FindProperty("awsAccessKey"));
                    EditorGUILayout.PropertyField(_settings.FindProperty("awsSecretKey"));
                    EditorGUILayout.PropertyField(_settings.FindProperty("awsSessionToken"));
                    break;
                    
                case CredentialMode.Profile:
                    DrawProfilePicker();
                    break;
                    
                case CredentialMode.DefaultOrEnvironment:
                    EditorGUILayout.HelpBox(
                        "Credentials will be resolved automatically from:\n" +
                        "• AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment variables\n" +
                        "• Default profile in ~/.aws/credentials\n" +
                        "• EC2/ECS instance metadata (CI environments)",
                        MessageType.None);
                    break;
            }
            
            EditorGUILayout.PropertyField(_settings.FindProperty("awsRegion"));
            
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Build Settings", EditorStyles.boldLabel);
            
            EditorGUILayout.PropertyField(_settings.FindProperty("autoCreateApplication"));
            EditorGUILayout.PropertyField(_settings.FindProperty("applicationName"));
            EditorGUILayout.PropertyField(_settings.FindProperty("applicationDescription"));

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Build Analytics", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Controls analytics for player builds. The app_version is automatically set from " +
                "Player Settings > Version on each build. Use app_version in Athena queries to " +
                "segment events by build version.", MessageType.None);
            EditorGUILayout.PropertyField(_settings.FindProperty("analyticsEnabledInBuilds"),
                new GUIContent("Enable Analytics in Builds"));
            EditorGUILayout.LabelField("Build Version (from Player Settings)", Application.version);

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Editor Play Mode Analytics", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Controls analytics when using Play Mode in the editor. Editor events are tagged " +
                "with a source field in event_data so they can be filtered in Athena.", MessageType.None);
            EditorGUILayout.PropertyField(_settings.FindProperty("editorAnalyticsEnabled"),
                new GUIContent("Enable Editor Analytics"));
            EditorGUILayout.PropertyField(_settings.FindProperty("editorAppVersionOverride"),
                new GUIContent("Editor app_version", "Override app_version for editor events. Leave empty to use Player Settings version."));
            EditorGUILayout.PropertyField(_settings.FindProperty("editorEventTag"),
                new GUIContent("Editor Event Tag", "Added to event_data.source for filtering. e.g. WHERE event_data.source = 'editor'"));
            
            // Collection Profile section
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Collection Profile", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Assign a Global Profile to control collection mode (Batched/Stream), batch policy, " +
                "and global metadata. Per-scene overrides can be applied via GAPSceneProfileLoader.", MessageType.None);
            EditorGUILayout.PropertyField(_settings.FindProperty("globalProfile"),
                new GUIContent("Global Profile", "Global collection profile asset. If null, defaults are used."));

            if (GUILayout.Button("Generate Default Global Profile"))
            {
                GenerateDefaultGlobalProfile();
            }

            _settings.ApplyModifiedProperties();
            
            // Action buttons
            EditorGUILayout.Space();
            EditorGUILayout.BeginHorizontal();
            
            if (GUILayout.Button("Test Connection"))
            {
                TestConnection();
            }
            
            if (GUILayout.Button("Quick Setup"))
            {
                GAPQuickSetupWindow.ShowWindow();
            }
            
            EditorGUILayout.EndHorizontal();
            
            // Send Test Event button (only enabled in Play Mode)
            EditorGUILayout.Space(4);
            GUI.enabled = Application.isPlaying;
            if (GUILayout.Button("Send Test Event"))
            {
                SendTestEvent();
            }
            GUI.enabled = true;
            if (!Application.isPlaying)
            {
                EditorGUILayout.HelpBox("Enter Play Mode to send test events.", MessageType.None);
            }
        }
        
        private void SendTestEvent()
        {
            var settings = GAPSettings.GetOrCreateSettings();

            if (string.IsNullOrEmpty(settings.apiEndpoint) ||
                string.IsNullOrEmpty(settings.applicationId) ||
                string.IsNullOrEmpty(settings.apiKey))
            {
                EditorUtility.DisplayDialog("Configuration Required",
                    "Please configure API endpoint, Application ID, and API Key above.", "OK");
                return;
            }

            var eventData = new System.Collections.Generic.Dictionary<string, object>
            {
                { "test_type", "manual_editor_test" },
                { "timestamp", System.DateTime.UtcNow.ToString("o") },
                { "unity_version", Application.unityVersion }
            };

            GAPClient.Instance.TrackEvent("editor_test_event", eventData);

            Debug.Log("[GAP] Test event sent!");
            EditorUtility.DisplayDialog("Test Event Sent",
                "Test event has been queued for sending.\nCheck the Console for confirmation.", "OK");
        }
        
        private void DrawProfilePicker()
        {
            EditorGUILayout.BeginHorizontal();
            
            if (_profileNames.Length > 0)
            {
                // Sync dropdown index with the stored profile name
                var currentProfile = _settings.FindProperty("awsProfile").stringValue;
                _selectedProfileIndex = System.Array.IndexOf(_profileNames, currentProfile);
                if (_selectedProfileIndex < 0) _selectedProfileIndex = 0;
                
                int newIndex = EditorGUILayout.Popup("AWS Profile", _selectedProfileIndex, _profileNames);
                if (newIndex != _selectedProfileIndex || string.IsNullOrEmpty(currentProfile))
                {
                    _selectedProfileIndex = newIndex;
                    _settings.FindProperty("awsProfile").stringValue = _profileNames[newIndex];
                }
            }
            else
            {
                EditorGUILayout.HelpBox(
                    "No AWS profiles found. Run 'aws configure' to create one.", MessageType.Warning);
            }
            
            if (GUILayout.Button("Refresh", GUILayout.Width(70)))
            {
                RefreshProfiles();
            }
            
            EditorGUILayout.EndHorizontal();
        }
        
        private void RefreshProfiles()
        {
            _profileNames = AWSCredentialHelper.ListProfiles();
            _selectedProfileIndex = -1;
        }
        
        private void TestConnection()
        {
            var settings = GAPSettings.GetOrCreateSettings();
            if (string.IsNullOrEmpty(settings.apiEndpoint))
            {
                EditorUtility.DisplayDialog("Test Failed", "API Endpoint is not configured.", "OK");
                return;
            }

            EditorUtility.DisplayProgressBar("Testing Connection", "Connecting to GAP API...", 0.5f);

            GAPConnectionTester.TestConnection(settings, (success, message) =>
            {
                EditorUtility.ClearProgressBar();
                if (success)
                {
                    EditorUtility.DisplayDialog("Connection Test",
                        "✓ Connection successful!\n\n" + message, "OK");
                }
                else
                {
                    EditorUtility.DisplayDialog("Connection Test Failed",
                        "✗ Connection failed:\n\n" + message, "OK");
                }
            });
        }
        
        private void GenerateDefaultGlobalProfile()
        {
            const string profileDir = "Assets/GAPUnityPlugin/Profiles";
            const string profilePath = profileDir + "/DefaultGlobalProfile.asset";

            // Check if one already exists
            var existing = AssetDatabase.LoadAssetAtPath<GAPGlobalProfile>(profilePath);
            if (existing != null)
            {
                if (!EditorUtility.DisplayDialog("Profile Exists",
                    $"A default global profile already exists at:\n{profilePath}\n\nOverwrite it?",
                    "Overwrite", "Cancel"))
                {
                    return;
                }
                AssetDatabase.DeleteAsset(profilePath);
            }

            // Ensure directory exists
            if (!AssetDatabase.IsValidFolder("Assets/GAPUnityPlugin"))
            {
                AssetDatabase.CreateFolder("Assets", "GAPUnityPlugin");
            }
            if (!AssetDatabase.IsValidFolder(profileDir))
            {
                AssetDatabase.CreateFolder("Assets/GAPUnityPlugin", "Profiles");
            }

            // Create the profile with sensible defaults
            var profile = ScriptableObject.CreateInstance<GAPGlobalProfile>();
            profile.collectionMode = CollectionMode.Batched;
            profile.batchPolicy = new BatchPolicy
            {
                maxIntervalSeconds = 30f,
                maxBatchCount = 100
            };

            AssetDatabase.CreateAsset(profile, profilePath);
            AssetDatabase.SaveAssets();

            // Assign to settings
            var settings = GAPSettings.GetOrCreateSettings();
            settings.globalProfile = profile;
            EditorUtility.SetDirty(settings);
            AssetDatabase.SaveAssets();

            // Refresh the serialized object so the UI updates
            _settings = GAPSettings.GetSerializedSettings();

            Debug.Log($"[GAP] Default Global Profile created at: {profilePath}");
            EditorUtility.DisplayDialog("Profile Created",
                $"Default Global Profile created at:\n{profilePath}\n\n" +
                "It has been automatically assigned to GAP Settings.", "OK");

            // Ping the asset in the Project window
            EditorGUIUtility.PingObject(profile);
        }

        [SettingsProvider]
        public static SettingsProvider CreateGAPSettingsProvider()
        {
            return new GAPSettingsProvider("Project/Game Analytics Pipeline", SettingsScope.Project)
            {
                keywords = new[] { "GAP", "Analytics", "Game", "Pipeline", "AWS" }
            };
        }
    }
}
