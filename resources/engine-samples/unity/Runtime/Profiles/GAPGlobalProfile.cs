using System.Collections.Generic;
using UnityEngine;

namespace GAP
{
    [CreateAssetMenu(fileName = "GAPGlobalProfile", menuName = "GAP/Global Profile")]
    public class GAPGlobalProfile : ScriptableObject
    {
        public CollectionMode collectionMode = CollectionMode.Batched;
        public BatchPolicy batchPolicy = new BatchPolicy();
        public List<MetadataEntry> globalMetadata = new List<MetadataEntry>();
    }
}
