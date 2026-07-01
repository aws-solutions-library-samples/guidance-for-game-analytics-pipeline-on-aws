using System;
using UnityEngine;

namespace GAP
{
    public enum CollectionMode { Batched, Stream }

    [Serializable]
    public class BatchPolicy
    {
        [Tooltip("Seconds between automatic flushes. 0 = flush every event.")]
        public float maxIntervalSeconds = 30f;

        [Tooltip("Max events before flush. 0 = time-only batching.")]
        public int maxBatchCount = 100;
    }

    [Serializable]
    public class MetadataEntry
    {
        public string key;
        public string value;
    }
}
