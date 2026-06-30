using System.Collections.Generic;
using UnityEngine;

namespace GAP
{
    [CreateAssetMenu(fileName = "GAPSceneProfile", menuName = "GAP/Scene Profile")]
    public class GAPSceneProfile : ScriptableObject
    {
        public bool overrideCollectionMode;
        public CollectionMode collectionMode;

        public bool overrideBatchPolicy;
        public BatchPolicy batchPolicy = new BatchPolicy();

        public List<MetadataEntry> sceneMetadata = new List<MetadataEntry>();
    }
}
