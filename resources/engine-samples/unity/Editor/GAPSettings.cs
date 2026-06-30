using UnityEngine;
using UnityEditor;

namespace GAP.Editor
{
    /// <summary>
    /// ScriptableObject to store GAP configuration settings
    /// </summary>
    public class GAPSettings : ScriptableObject
    {
        private const string SettingsPath = "Assets/Resources/GAPSettings.asset";
        
        [Header("API Configuration")]
        [Tooltip("The base URL of your GAP API endpoint")]
        public string apiEndpoint = "";
        
        [Tooltip("Your application ID from GAP")]
        public string applicationId = "";
        
        [Tooltip("API key for sending events")]
        public string apiKey = "";
        
        [Header("AWS Credential Configuration (Editor Only)")]
        [Tooltip("How to resolve AWS credentials: Explicit keys, Default/Environment chain, or named Profile")]
        public CredentialMode credentialMode = CredentialMode.DefaultOrEnvironment;
        
        [Tooltip("AWS profile name (used when Credential Mode is Profile)")]
        public string awsProfile = "";
        
        [Tooltip("AWS Access Key for admin operations (used when Credential Mode is Explicit)")]
        public string awsAccessKey = "";
        
        [Tooltip("AWS Secret Key for admin operations (used when Credential Mode is Explicit)")]
        public string awsSecretKey = "";
        
        [Tooltip("AWS Session Token for temporary credentials (used when Credential Mode is Explicit)")]
        public string awsSessionToken = "";
        
        [Tooltip("AWS Region where GAP is deployed")]
        public string awsRegion = "us-east-1";
        
        [Header("Build Settings")]
        [Tooltip("Auto-create application on build if it doesn't exist")]
        public bool autoCreateApplication = true;
        
        [Tooltip("Application name to use when auto-creating")]
        public string applicationName = "";
        
        [Tooltip("Application description")]
        public string applicationDescription = "";

        [Header("Build Analytics")]
        [Tooltip("Include analytics in player builds")]
        public bool analyticsEnabledInBuilds = true;

        [Header("Editor Play Mode Analytics")]
        [Tooltip("Send analytics events when using Play Mode in the editor")]
        public bool editorAnalyticsEnabled = false;

        [Tooltip("app_version override for editor play mode (e.g. 'dev', '1.0-editor'). Leave empty to use Player Settings version.")]
        public string editorAppVersionOverride = "editor";

        [Tooltip("Value added to event_data.source for editor events, for filtering in Athena")]
        public string editorEventTag = "editor";

        [Header("Collection Profile")]
        [Tooltip("Global collection profile asset. If null, defaults are used (Batched, 30s interval, 100 count).")]
        public GAPGlobalProfile globalProfile;
        
        public static GAPSettings GetOrCreateSettings()
        {
            var settings = AssetDatabase.LoadAssetAtPath<GAPSettings>(SettingsPath);
            if (settings == null)
            {
                settings = CreateInstance<GAPSettings>();
                settings.applicationName = Application.productName;
                settings.applicationDescription = $"Analytics for {Application.productName}";
                
                if (!AssetDatabase.IsValidFolder("Assets/Resources"))
                {
                    AssetDatabase.CreateFolder("Assets", "Resources");
                }
                
                AssetDatabase.CreateAsset(settings, SettingsPath);
                AssetDatabase.SaveAssets();
            }
            return settings;
        }
        
        internal static SerializedObject GetSerializedSettings()
        {
            return new SerializedObject(GetOrCreateSettings());
        }
    }
}
