using System;
using System.Collections;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace GAP.Editor
{
    /// <summary>
    /// Build processor that stamps GAPRuntimeConfig with version info and analytics settings,
    /// and optionally auto-creates GAP applications and API keys.
    /// </summary>
    public class GAPBuildProcessor : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;

        public void OnPreprocessBuild(BuildReport report)
        {
            var settings = GAPSettings.GetOrCreateSettings();
            var runtimeConfig = StampRuntimeConfig(settings);

            Debug.Log($"[GAP:Build] Runtime config stamped — analyticsEnabled: {runtimeConfig.analyticsEnabled}, appVersion: '{runtimeConfig.appVersion}'");

            if (!settings.autoCreateApplication)
            {
                Debug.Log("[GAP:Build] Auto-create application is disabled");
                return;
            }

            if (string.IsNullOrEmpty(settings.apiEndpoint))
            {
                Debug.LogWarning("[GAP:Build] API endpoint not configured. Skipping application creation.");
                return;
            }

            if (!string.IsNullOrEmpty(settings.applicationId))
            {
                Debug.Log($"[GAP:Build] Using existing application: {settings.applicationId}");
                return;
            }

            Amazon.Runtime.AWSCredentials creds;
            try
            {
                creds = AWSCredentialHelper.Resolve(settings);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[GAP:Build] Could not resolve AWS credentials for build-time app creation: {e.Message}");
                return;
            }

            Debug.Log("[GAP:Build] No application ID found. Creating new application...");
            EditorCoroutineUtility.StartCoroutine(CreateApplication(settings, creds), null);
        }

        /// <summary>
        /// Creates or updates the GAPRuntimeConfig asset in Resources with current settings and version.
        /// </summary>
        private GAPRuntimeConfig StampRuntimeConfig(GAPSettings settings)
        {
            const string configPath = "Assets/Resources/GAPRuntimeConfig.asset";

            if (!AssetDatabase.IsValidFolder("Assets/Resources"))
            {
                AssetDatabase.CreateFolder("Assets", "Resources");
            }

            var config = AssetDatabase.LoadAssetAtPath<GAPRuntimeConfig>(configPath);
            if (config == null)
            {
                config = ScriptableObject.CreateInstance<GAPRuntimeConfig>();
                AssetDatabase.CreateAsset(config, configPath);
            }

            // Stamp API config
            config.apiEndpoint = settings.apiEndpoint;
            config.applicationId = settings.applicationId;
            config.apiKey = settings.apiKey;

            // Stamp analytics settings
            config.analyticsEnabled = settings.analyticsEnabledInBuilds;
            config.appVersion = Application.version; // from Player Settings

            // Stamp editor play mode settings (used when running in editor)
            config.editorAnalyticsEnabled = settings.editorAnalyticsEnabled;
            config.editorAppVersionOverride = settings.editorAppVersionOverride;
            config.editorEventTag = settings.editorEventTag;

            // Stamp collection profile reference
            config.globalProfile = settings.globalProfile;

            EditorUtility.SetDirty(config);
            AssetDatabase.SaveAssets();

            Debug.Log($"[GAP:Build] Stamped GAPRuntimeConfig — version: '{config.appVersion}', analytics: {config.analyticsEnabled}");
            return config;
        }

        private IEnumerator CreateApplication(GAPSettings settings, Amazon.Runtime.AWSCredentials creds)
        {
            bool completed = false;
            bool success = false;
            string applicationId = null;

            GAPAdminClient.CreateApplication(settings, creds,
                settings.applicationName, settings.applicationDescription,
                (isSuccess, message, appId) =>
                {
                    completed = true;
                    success = isSuccess;
                    applicationId = appId;
                    if (isSuccess)
                        Debug.Log($"[GAP:Build] Created application: {appId}");
                    else
                        Debug.LogError($"[GAP:Build] {message}");
                });

            while (!completed) yield return null;

            if (success && !string.IsNullOrEmpty(applicationId))
            {
                settings.applicationId = applicationId;
                EditorUtility.SetDirty(settings);
                AssetDatabase.SaveAssets();
                yield return CreateAPIKey(settings, creds);
            }
        }

        private IEnumerator CreateAPIKey(GAPSettings settings, Amazon.Runtime.AWSCredentials creds)
        {
            bool completed = false;
            bool success = false;
            string apiKey = null;

            GAPAdminClient.CreateAPIKey(settings, creds,
                settings.applicationId, $"{settings.applicationName} Key", "Auto-generated API key",
                (isSuccess, message, key) =>
                {
                    completed = true;
                    success = isSuccess;
                    apiKey = key;
                    if (isSuccess)
                        Debug.Log("[GAP:Build] Created API key");
                    else
                        Debug.LogError($"[GAP:Build] {message}");
                });

            while (!completed) yield return null;

            if (success && !string.IsNullOrEmpty(apiKey))
            {
                settings.apiKey = apiKey;
                EditorUtility.SetDirty(settings);
                AssetDatabase.SaveAssets();
            }
        }
    }

    /// <summary>
    /// Utility for running coroutines in editor.
    /// Handles UnityWebRequestAsyncOperation and other AsyncOperation yields properly.
    /// </summary>
    public static class EditorCoroutineUtility
    {
        public static void StartCoroutine(IEnumerator routine, object owner)
        {
            AsyncOperation pendingOp = null;

            EditorApplication.update += Update;

            void Update()
            {
                if (pendingOp != null)
                {
                    if (!pendingOp.isDone)
                        return;
                    pendingOp = null;
                }

                bool hasMore;
                try
                {
                    hasMore = routine.MoveNext();
                }
                catch (Exception e)
                {
                    Debug.LogError($"[GAP:Coroutine] Exception in editor coroutine: {e.GetType().Name}: {e.Message}\n{e.StackTrace}");
                    EditorApplication.update -= Update;
                    return;
                }

                if (!hasMore)
                {
                    EditorApplication.update -= Update;
                    return;
                }

                if (routine.Current is AsyncOperation asyncOp)
                {
                    pendingOp = asyncOp;
                }
            }
        }
    }
}
