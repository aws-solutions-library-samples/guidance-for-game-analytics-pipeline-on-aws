using System.Collections.Generic;
using UnityEngine;
using GAP.Serialization;

namespace GAP
{
    /// <summary>
    /// Auto-initializes GAP client on game start using GAPRuntimeConfig.
    /// Handles both player builds and editor play mode with appropriate settings.
    /// </summary>
    public class GAPInitializer : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Initialize()
        {
            // Register built-in type converters for Unity type serialization
            TypeConverterRegistry.Instance.RegisterBuiltins();

            Debug.Log("[GAP:Init] RuntimeInitializeOnLoadMethod — loading config...");

            // Try runtime config first (stamped by build processor)
            var runtimeConfig = GAPRuntimeConfig.Load();

            // Fall back to editor settings if no runtime config exists
            if (runtimeConfig == null)
            {
                Debug.Log("[GAP:Init] No GAPRuntimeConfig found, falling back to GAPSettings...");
                InitializeFromSettings();
                return;
            }

            bool isEditor = Application.isEditor;
            Debug.Log($"[GAP:Init] GAPRuntimeConfig loaded — isEditor: {isEditor}");

            // Determine if analytics should be enabled
            bool analyticsEnabled;
            string appVersion;
            string editorTag = null;

            if (isEditor)
            {
                analyticsEnabled = runtimeConfig.editorAnalyticsEnabled;
                appVersion = string.IsNullOrEmpty(runtimeConfig.editorAppVersionOverride)
                    ? Application.version
                    : runtimeConfig.editorAppVersionOverride;
                editorTag = runtimeConfig.editorEventTag;
                Debug.Log($"[GAP:Init] Editor mode — analyticsEnabled: {analyticsEnabled}, appVersion: '{appVersion}', editorTag: '{editorTag}'");
            }
            else
            {
                analyticsEnabled = runtimeConfig.analyticsEnabled;
                appVersion = runtimeConfig.appVersion;
                Debug.Log($"[GAP:Init] Build mode — analyticsEnabled: {analyticsEnabled}, appVersion: '{appVersion}'");
            }

            if (!analyticsEnabled)
            {
                Debug.Log("[GAP:Init] Analytics disabled — GAPClient will not send events");
                // Still initialize so TrackEvent calls don't error, but flag as disabled
                GAPClient.Instance.Initialize(
                    runtimeConfig.apiEndpoint, runtimeConfig.applicationId, runtimeConfig.apiKey,
                    appVersion, false, isEditor, editorTag);
                InitializeProfileManager(runtimeConfig);
                InitializePersistence();
                return;
            }

            if (string.IsNullOrEmpty(runtimeConfig.apiEndpoint) ||
                string.IsNullOrEmpty(runtimeConfig.applicationId) ||
                string.IsNullOrEmpty(runtimeConfig.apiKey))
            {
                Debug.LogWarning("[GAP:Init] Configuration incomplete — missing: " +
                    $"{(string.IsNullOrEmpty(runtimeConfig.apiEndpoint) ? "apiEndpoint " : "")}" +
                    $"{(string.IsNullOrEmpty(runtimeConfig.applicationId) ? "applicationId " : "")}" +
                    $"{(string.IsNullOrEmpty(runtimeConfig.apiKey) ? "apiKey " : "")}");
                return;
            }

            GAPClient.Instance.Initialize(
                runtimeConfig.apiEndpoint, runtimeConfig.applicationId, runtimeConfig.apiKey,
                appVersion, true, isEditor, editorTag);
            InitializeProfileManager(runtimeConfig);
            InitializePersistence();

            // Track session start
            Debug.Log("[GAP:Init] Sending session_start event...");
            GAPClient.Instance.TrackEvent("session_start", new Dictionary<string, object>
            {
                { "platform", Application.platform.ToString() },
                { "version", Application.version },
                { "unity_version", Application.unityVersion }
            }, eventName: "session_start");
        }

        private static void InitializeProfileManager(GAPRuntimeConfig runtimeConfig)
        {
            GAPGlobalProfile globalProfile = runtimeConfig?.globalProfile;
            ProfileManager.Instance.Initialize(globalProfile);
            ProfileManager.Instance.OnProfileChanged += () =>
            {
                GAPClient.Instance?.ApplyProfile(
                    ProfileManager.Instance.EffectiveCollectionMode,
                    ProfileManager.Instance.EffectiveBatchPolicy);
            };
            GAPClient.Instance?.ApplyProfile(
                ProfileManager.Instance.EffectiveCollectionMode,
                ProfileManager.Instance.EffectiveBatchPolicy);
            Debug.Log($"[GAP:Init] ProfileManager initialized — mode: {ProfileManager.Instance.EffectiveCollectionMode}, " +
                $"interval: {ProfileManager.Instance.EffectiveBatchPolicy.maxIntervalSeconds}s, " +
                $"count: {ProfileManager.Instance.EffectiveBatchPolicy.maxBatchCount}");
        }

        private static void InitializePersistence()
        {
            try
            {
                string gapDirectory = Application.persistentDataPath + "/GAP";
                var dedupRegistry = new DeduplicationRegistry(gapDirectory + "/dedup.txt");
                dedupRegistry.Load();
                var persister = new QueuePersister(gapDirectory, 256, dedupRegistry);
                var recovered = persister.Recover();
                GAPClient.Instance.SetPersistence(persister, dedupRegistry);
                if (recovered.Count > 0)
                {
                    Debug.Log($"[GAP:Init] Recovered {recovered.Count} events from WAL");
                    GAPClient.Instance.EnqueueRecoveredEvents(recovered);
                }
            }
            catch (System.Exception ex)
            {
                Debug.LogWarning($"[GAP:Init] Persistence initialization failed: {ex.Message}. Events will not be crash-safe.");
            }
        }

        /// <summary>
        /// Fallback initialization from GAPSettings (editor-only ScriptableObject).
        /// Used when GAPRuntimeConfig hasn't been stamped yet (e.g. first editor play).
        /// </summary>
        private static void InitializeFromSettings()
        {
            // Register built-in type converters for Unity type serialization
            TypeConverterRegistry.Instance.RegisterBuiltins();

            var settings = Resources.Load<ScriptableObject>("GAPSettings");
            if (settings == null)
            {
                Debug.LogWarning("[GAP:Init] No GAPSettings found either. Configure GAP in Project Settings.");
                return;
            }

            var apiEndpoint = GetFieldValue<string>(settings, "apiEndpoint");
            var applicationId = GetFieldValue<string>(settings, "applicationId");
            var apiKey = GetFieldValue<string>(settings, "apiKey");
            var editorAnalyticsEnabled = GetFieldValue<bool>(settings, "editorAnalyticsEnabled");
            var editorAppVersionOverride = GetFieldValue<string>(settings, "editorAppVersionOverride");
            var editorEventTag = GetFieldValue<string>(settings, "editorEventTag");

            string appVersion = string.IsNullOrEmpty(editorAppVersionOverride)
                ? Application.version
                : editorAppVersionOverride;

            Debug.Log($"[GAP:Init] Fallback from GAPSettings — editorAnalytics: {editorAnalyticsEnabled}, appVersion: '{appVersion}'");

            if (!editorAnalyticsEnabled)
            {
                Debug.Log("[GAP:Init] Editor analytics disabled in settings");
                GAPClient.Instance.Initialize(apiEndpoint, applicationId, apiKey,
                    appVersion, false, true, editorEventTag);
                InitializeProfileManager(null);
                InitializePersistence();
                return;
            }

            if (string.IsNullOrEmpty(apiEndpoint) || string.IsNullOrEmpty(applicationId) || string.IsNullOrEmpty(apiKey))
            {
                Debug.LogWarning("[GAP:Init] Configuration incomplete. Configure GAP in Project Settings.");
                return;
            }

            GAPClient.Instance.Initialize(apiEndpoint, applicationId, apiKey,
                appVersion, true, true, editorEventTag);
            InitializeProfileManager(null);
            InitializePersistence();

            GAPClient.Instance.TrackEvent("session_start", new Dictionary<string, object>
            {
                { "platform", Application.platform.ToString() },
                { "version", Application.version },
                { "unity_version", Application.unityVersion }
            }, eventName: "session_start");
        }

        private static T GetFieldValue<T>(object obj, string fieldName)
        {
            var field = obj.GetType().GetField(fieldName);
            return field != null ? (T)field.GetValue(obj) : default(T);
        }
    }
}
