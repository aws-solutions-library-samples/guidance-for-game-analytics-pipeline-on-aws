using UnityEngine;

namespace GAP
{
    /// <summary>
    /// Runtime configuration baked into builds by the build processor.
    /// Stored in Resources so it's accessible at runtime without editor dependencies.
    /// </summary>
    public class GAPRuntimeConfig : ScriptableObject
    {
        private const string ResourcePath = "GAPRuntimeConfig";

        [Header("API Configuration")]
        public string apiEndpoint = "";
        public string applicationId = "";
        public string apiKey = "";

        [Header("Analytics")]
        [Tooltip("When false, no events are sent from this build")]
        public bool analyticsEnabled = true;

        [Tooltip("app_version stamped on every event (set automatically from Player Settings on build)")]
        public string appVersion = "";

        [Header("Editor Play Mode")]
        [Tooltip("Send analytics events when using Play Mode in the editor")]
        public bool editorAnalyticsEnabled = false;

        [Tooltip("app_version override for editor play mode (e.g. 'dev', '1.0-editor'). Leave empty to use Player Settings version.")]
        public string editorAppVersionOverride = "editor";

        [Tooltip("Value added to event_data.source for editor events, for filtering in Athena")]
        public string editorEventTag = "editor";

        [Header("Collection Profile")]
        [Tooltip("Global collection profile asset. If null, defaults are used.")]
        public GAPGlobalProfile globalProfile;

        /// <summary>
        /// Load the runtime config from Resources.
        /// </summary>
        public static GAPRuntimeConfig Load()
        {
            return Resources.Load<GAPRuntimeConfig>(ResourcePath);
        }
    }
}
