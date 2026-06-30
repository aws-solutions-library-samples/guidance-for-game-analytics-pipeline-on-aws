using System;
using System.Collections.Generic;

namespace GAP
{
    /// <summary>
    /// Singleton that resolves the effective collection profile by merging
    /// the global profile with any active scene overrides (stack-based).
    /// The most recently applied scene override takes precedence.
    /// </summary>
    public class ProfileManager
    {
        private static ProfileManager _instance;
        public static ProfileManager Instance
        {
            get
            {
                if (_instance == null)
                    _instance = new ProfileManager();
                return _instance;
            }
        }

        private GAPGlobalProfile _globalProfile;
        private readonly List<GAPSceneProfile> _sceneOverrideStack = new List<GAPSceneProfile>();

        public CollectionMode EffectiveCollectionMode { get; private set; }
        public BatchPolicy EffectiveBatchPolicy { get; private set; }
        public IReadOnlyDictionary<string, string> EffectiveMetadata => _effectiveMetadata;

        private Dictionary<string, string> _effectiveMetadata = new Dictionary<string, string>();

        /// <summary>
        /// Fired whenever the effective profile changes (initialization, scene override applied/removed).
        /// </summary>
        public event Action OnProfileChanged;

        private ProfileManager() { }

        /// <summary>
        /// Initializes the ProfileManager with the global profile and computes the initial effective state.
        /// </summary>
        public void Initialize(GAPGlobalProfile globalProfile)
        {
            _globalProfile = globalProfile;
            _sceneOverrideStack.Clear();
            RecomputeEffectiveProfile();
        }

        /// <summary>
        /// Pushes a scene override onto the stack. The most recently applied override takes precedence.
        /// </summary>
        public void ApplySceneOverride(GAPSceneProfile sceneProfile)
        {
            if (sceneProfile == null) return;

            // Avoid duplicates in the stack
            if (!_sceneOverrideStack.Contains(sceneProfile))
            {
                _sceneOverrideStack.Add(sceneProfile);
            }

            RecomputeEffectiveProfile();
        }

        /// <summary>
        /// Removes a scene override from the stack. Falls back to the previous override or global profile.
        /// </summary>
        public void RemoveSceneOverride(GAPSceneProfile sceneProfile)
        {
            if (sceneProfile == null) return;

            _sceneOverrideStack.Remove(sceneProfile);
            RecomputeEffectiveProfile();
        }

        /// <summary>
        /// Returns merged metadata with precedence: global &lt; scene &lt; event.
        /// Event-level keys in eventData override profile metadata.
        /// </summary>
        public Dictionary<string, string> MergeMetadataForEvent(Dictionary<string, object> eventData)
        {
            // Start with a copy of the effective (global + scene) metadata
            var merged = new Dictionary<string, string>(_effectiveMetadata);

            // Event-level data takes final precedence
            if (eventData != null)
            {
                foreach (var kvp in eventData)
                {
                    merged[kvp.Key] = kvp.Value?.ToString() ?? string.Empty;
                }
            }

            return merged;
        }

        private void RecomputeEffectiveProfile()
        {
            // Resolve collection mode
            EffectiveCollectionMode = ResolveCollectionMode();

            // Resolve batch policy
            EffectiveBatchPolicy = ResolveBatchPolicy();

            // Resolve metadata
            _effectiveMetadata = ResolveMetadata();

            // Notify listeners
            OnProfileChanged?.Invoke();
        }

        private CollectionMode ResolveCollectionMode()
        {
            // Default from global profile
            var mode = _globalProfile != null ? _globalProfile.collectionMode : CollectionMode.Batched;

            // Apply the top-most scene override that has collectionMode overridden
            for (int i = _sceneOverrideStack.Count - 1; i >= 0; i--)
            {
                var scene = _sceneOverrideStack[i];
                if (scene != null && scene.overrideCollectionMode)
                {
                    mode = scene.collectionMode;
                    break;
                }
            }

            return mode;
        }

        private BatchPolicy ResolveBatchPolicy()
        {
            // Default from global profile
            var policy = _globalProfile != null ? _globalProfile.batchPolicy : new BatchPolicy();

            // Apply the top-most scene override that has batchPolicy overridden
            for (int i = _sceneOverrideStack.Count - 1; i >= 0; i--)
            {
                var scene = _sceneOverrideStack[i];
                if (scene != null && scene.overrideBatchPolicy)
                {
                    policy = scene.batchPolicy;
                    break;
                }
            }

            return policy ?? new BatchPolicy();
        }

        private Dictionary<string, string> ResolveMetadata()
        {
            var metadata = new Dictionary<string, string>();

            // Layer 1: Global metadata
            if (_globalProfile != null && _globalProfile.globalMetadata != null)
            {
                foreach (var entry in _globalProfile.globalMetadata)
                {
                    if (entry != null && entry.key != null)
                    {
                        metadata[entry.key] = entry.value ?? string.Empty;
                    }
                }
            }

            // Layer 2: Scene metadata from the top-most override
            // All scene overrides contribute metadata (merged in stack order, later overrides win)
            foreach (var scene in _sceneOverrideStack)
            {
                if (scene != null && scene.sceneMetadata != null)
                {
                    foreach (var entry in scene.sceneMetadata)
                    {
                        if (entry != null && entry.key != null)
                        {
                            metadata[entry.key] = entry.value ?? string.Empty;
                        }
                    }
                }
            }

            return metadata;
        }

        /// <summary>
        /// Resets the singleton instance. Intended for testing purposes only.
        /// </summary>
        internal static void ResetInstance()
        {
            _instance = null;
        }
    }
}
