using UnityEngine;

namespace GAP
{
    /// <summary>
    /// MonoBehaviour that applies a GAPSceneProfile override when the scene loads
    /// and reverts it when the scene unloads. Place this on a GameObject in any scene
    /// that requires custom collection settings.
    /// </summary>
    public class GAPSceneProfileLoader : MonoBehaviour
    {
        [SerializeField] private GAPSceneProfile sceneProfile;

        private void OnEnable()
        {
            if (sceneProfile != null)
            {
                ProfileManager.Instance.ApplySceneOverride(sceneProfile);
                Debug.Log($"[GAP:Profile] Scene profile '{sceneProfile.name}' applied — " +
                    $"effective mode: {ProfileManager.Instance.EffectiveCollectionMode}, " +
                    $"interval: {ProfileManager.Instance.EffectiveBatchPolicy.maxIntervalSeconds}s, " +
                    $"count: {ProfileManager.Instance.EffectiveBatchPolicy.maxBatchCount}, " +
                    $"metadata keys: {ProfileManager.Instance.EffectiveMetadata.Count}");
            }
            else
            {
                Debug.LogWarning($"[GAP:Profile] GAPSceneProfileLoader on '{gameObject.name}' has no scene profile assigned.");
            }
        }

        private void OnDisable()
        {
            if (sceneProfile != null)
            {
                ProfileManager.Instance.RemoveSceneOverride(sceneProfile);
                Debug.Log($"[GAP:Profile] Scene profile '{sceneProfile.name}' removed — " +
                    $"reverted to mode: {ProfileManager.Instance.EffectiveCollectionMode}, " +
                    $"interval: {ProfileManager.Instance.EffectiveBatchPolicy.maxIntervalSeconds}s, " +
                    $"count: {ProfileManager.Instance.EffectiveBatchPolicy.maxBatchCount}");
            }
        }
    }
}
