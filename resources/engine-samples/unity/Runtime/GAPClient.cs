using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using GAP.Serialization;

namespace GAP
{
    /// <summary>
    /// Runtime client for sending events to Game Analytics Pipeline.
    /// Supports app_version stamping, analytics enable/disable, and editor event tagging.
    /// </summary>
    public class GAPClient : MonoBehaviour
    {
        private static GAPClient _instance;
        private static bool _isQuitting = false;

        private string _apiEndpoint;
        private string _applicationId;
        private string _apiKey;
        private string _appVersion;
        private bool _analyticsEnabled = true;
        private bool _isEditor = false;
        private string _editorEventTag;
        private Queue<EventData> _eventQueue = new Queue<EventData>();

        // Batch policy and collection mode fields
        private CollectionMode _collectionMode = CollectionMode.Batched;
        private BatchPolicy _batchPolicy = new BatchPolicy();
        private float _timeSinceLastFlush = 0f;
        private bool _flushScheduled = false;
        private Coroutine _flushCoroutine;

        // Persistence fields
        private QueuePersister _queuePersister;
        private DeduplicationRegistry _dedupRegistry;

        [Serializable]
        public class EventData
        {
            public string event_id;
            public string event_type;
            public string event_name;
            public long event_timestamp;
            public string event_version;
            public string app_version;
            public Dictionary<string, object> event_data;

            public EventData(string eventType, string eventName, string appVersion,
                Dictionary<string, object> data = null)
            {
                event_id = Guid.NewGuid().ToString();
                event_type = eventType;
                event_name = eventName ?? eventType;
                event_timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                event_version = "1.0";
                app_version = appVersion;
                event_data = data ?? new Dictionary<string, object>();
            }
        }

        public static GAPClient Instance
        {
            get
            {
                // Don't create a new instance during application shutdown —
                // other MonoBehaviours may call TrackEvent from OnDestroy after
                // GAPClient has already been destroyed.
                if (_isQuitting) return null;

                if (_instance == null)
                {
                    var go = new GameObject("GAPClient");
                    _instance = go.AddComponent<GAPClient>();
                    DontDestroyOnLoad(go);
                }
                return _instance;
            }
        }

        private void OnApplicationQuit()
        {
            _isQuitting = true;
            _queuePersister?.Flush();
            _queuePersister?.Dispose();
            _dedupRegistry?.Persist();
        }

        private void OnDestroy()
        {
            if (_instance == this)
                _instance = null;
        }

        /// <summary>
        /// Sets the persistence components for crash-safe event delivery.
        /// </summary>
        public void SetPersistence(QueuePersister persister, DeduplicationRegistry dedupRegistry)
        {
            _queuePersister = persister;
            _dedupRegistry = dedupRegistry;
        }

        /// <summary>
        /// Re-enqueues events recovered from the WAL after a crash.
        /// </summary>
        public void EnqueueRecoveredEvents(List<EventData> events)
        {
            foreach (var evt in events)
            {
                _eventQueue.Enqueue(evt);
            }
            if (events.Count > 0)
            {
                Debug.Log($"[GAP:Client] Re-enqueued {events.Count} recovered events from WAL");
                CheckFlushConditions();
            }
        }

        /// <summary>
        /// Whether analytics collection is currently enabled.
        /// </summary>
        public bool AnalyticsEnabled => _analyticsEnabled;

        /// <summary>
        /// The app_version being stamped on events.
        /// </summary>
        public string AppVersion => _appVersion;

        public CollectionMode CurrentCollectionMode => _collectionMode;
        public BatchPolicy CurrentBatchPolicy => _batchPolicy;

        /// <summary>
        /// Initialize the GAP client with configuration.
        /// </summary>
        public void Initialize(string apiEndpoint, string applicationId, string apiKey,
            string appVersion, bool analyticsEnabled, bool isEditor = false, string editorEventTag = null)
        {
            _apiEndpoint = apiEndpoint?.TrimEnd('/');
            _applicationId = applicationId;
            _apiKey = apiKey;
            _appVersion = appVersion ?? "";
            _analyticsEnabled = analyticsEnabled;
            _isEditor = isEditor;
            _editorEventTag = editorEventTag;

            Debug.Log($"[GAP:Client] Initialized — endpoint: {_apiEndpoint}, appId: {_applicationId}, " +
                $"appVersion: '{_appVersion}', analyticsEnabled: {_analyticsEnabled}, " +
                $"isEditor: {_isEditor}, editorTag: '{_editorEventTag}'");

            StartFlushLoop();
        }

        public void ApplyProfile(CollectionMode mode, BatchPolicy policy)
        {
            _collectionMode = mode;
            _batchPolicy = policy ?? new BatchPolicy();
            _timeSinceLastFlush = 0f;
            Debug.Log($"[GAP:Client] ApplyProfile — mode: {_collectionMode}, interval: {_batchPolicy.maxIntervalSeconds}s, maxCount: {_batchPolicy.maxBatchCount}");
            StartFlushLoop();
            CheckFlushConditions();
        }

        /// <summary>
        /// Track a custom event. eventName defaults to eventType if not provided.
        /// Safe to call from OnDestroy — silently drops the event if the application
        /// is shutting down and the client has already been destroyed.
        /// </summary>
        public static void Track(string eventType, Dictionary<string, object> eventData = null,
            string eventName = null)
        {
            Instance?.TrackEvent(eventType, eventData, eventName);
        }

        /// <summary>
        /// Track a custom event. eventName defaults to eventType if not provided.
        /// </summary>
        public void TrackEvent(string eventType, Dictionary<string, object> eventData = null,
            string eventName = null)
        {
            if (!_analyticsEnabled)
            {
                Debug.Log($"[GAP:Client] TrackEvent('{eventType}') — analytics disabled, skipping");
                return;
            }

            if (string.IsNullOrEmpty(_apiEndpoint) || string.IsNullOrEmpty(_applicationId))
            {
                Debug.LogWarning($"[GAP:Client] TrackEvent('{eventType}') — client not initialized");
                return;
            }
            // Inject editor tag into event_data if running in editor
            if (_isEditor && !string.IsNullOrEmpty(_editorEventTag))
            {
                eventData = eventData ?? new Dictionary<string, object>();
                eventData["source"] = _editorEventTag;
            }

            // Merge profile metadata (global < scene < event-specific)
            var profileMetadata = ProfileManager.Instance?.EffectiveMetadata;
            if (profileMetadata != null && profileMetadata.Count > 0)
            {
                eventData = eventData ?? new Dictionary<string, object>();
                foreach (var kvp in profileMetadata)
                {
                    if (!eventData.ContainsKey(kvp.Key))
                    {
                        eventData[kvp.Key] = kvp.Value;
                    }
                }
            }

            // Serialize Unity types in event_data to JSON-compatible representations
            if (eventData != null)
            {
                eventData = TypeSerializer.SerializeEventData(eventData);
            }

            var evt = new EventData(eventType, eventName, _appVersion, eventData);

            // Persist to WAL before enqueuing (crash safety)
            _queuePersister?.Append(evt);

            _eventQueue.Enqueue(evt);
            Debug.Log($"[GAP:Client] TrackEvent('{eventType}') — queued (id: {evt.event_id}, " +
                $"app_version: '{evt.app_version}', queue size: {_eventQueue.Count})");

            // Check if we need to flush immediately based on current policy
            CheckFlushConditions();
        }

        private void StartFlushLoop()
        {
            if (_flushCoroutine != null)
            {
                StopCoroutine(_flushCoroutine);
                _flushCoroutine = null;
            }
            float interval = GetEffectiveFlushInterval();
            if (interval > 0f)
                _flushCoroutine = StartCoroutine(FlushLoop(interval));
        }

        private float GetEffectiveFlushInterval()
        {
            if (_collectionMode == CollectionMode.Stream)
                return Mathf.Min(_batchPolicy.maxIntervalSeconds, 1f);
            return _batchPolicy.maxIntervalSeconds;
        }

        private int GetEffectiveMaxBatchCount()
        {
            if (_collectionMode == CollectionMode.Stream)
                return 1;
            return _batchPolicy.maxBatchCount;
        }

        private IEnumerator FlushLoop(float interval)
        {
            while (true)
            {
                yield return new WaitForSeconds(interval);
                _timeSinceLastFlush += interval;
                if (_eventQueue.Count > 0 && !_flushScheduled)
                {
                    _flushScheduled = true;
                    yield return StartCoroutine(FlushEvents());
                    _flushScheduled = false;
                    _timeSinceLastFlush = 0f;
                }
            }
        }

        private void CheckFlushConditions()
        {
            if (_eventQueue.Count == 0 || _flushScheduled)
                return;
            bool shouldFlush = false;
            float effectiveInterval = GetEffectiveFlushInterval();
            int effectiveMaxCount = GetEffectiveMaxBatchCount();
            if (effectiveInterval <= 0f)
                shouldFlush = true;
            if (effectiveMaxCount > 0 && _eventQueue.Count >= effectiveMaxCount)
                shouldFlush = true;
            if (shouldFlush)
            {
                _flushScheduled = true;
                StartCoroutine(FlushAndReset());
            }
        }

        private IEnumerator FlushAndReset()
        {
            yield return StartCoroutine(FlushEvents());
            _flushScheduled = false;
            _timeSinceLastFlush = 0f;
        }

        private IEnumerator FlushEvents()
        {
            while (_eventQueue.Count > 0)
            {
                var batch = new List<EventData>();
                int batchSize = Mathf.Min(100, _eventQueue.Count);
                for (int i = 0; i < batchSize; i++)
                    batch.Add(_eventQueue.Dequeue());
                yield return StartCoroutine(SendBatch(batch));
            }
        }

        private IEnumerator SendBatch(List<EventData> events)
        {
            string url = $"{_apiEndpoint}/applications/{_applicationId}/events";
            string jsonData = BuildBatchJson(events);
            Debug.Log($"[GAP:Client] SendBatch — POST {url} ({events.Count} events, {jsonData.Length} bytes)");

            using (UnityWebRequest request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonData);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", _apiKey);

                yield return request.SendWebRequest();

                if (request.result == UnityWebRequest.Result.Success)
                {
                    Debug.Log($"[GAP:Client] SendBatch — success ({events.Count} events), response: {request.downloadHandler.text}");

                    // Mark events as committed in WAL and register in dedup registry
                    if (_queuePersister != null)
                    {
                        var sentIds = new List<string>();
                        foreach (var e in events)
                            sentIds.Add(e.event_id);
                        _queuePersister.Flush();
                        _queuePersister.MarkCommitted(sentIds);
                    }
                    if (_dedupRegistry != null)
                    {
                        foreach (var e in events)
                            _dedupRegistry.Register(e.event_id);
                    }
                }
                else
                {
                    Debug.LogError($"[GAP:Client] SendBatch — failed: {request.error}\n  Response Code: {request.responseCode}\n  Body: {request.downloadHandler.text}\n  URL: {url}");
                }
            }
        }

        /// <summary>
        /// Build the JSON payload manually to match the GAP API schema exactly.
        /// JsonUtility doesn't handle Dictionary serialization, so we build it by hand.
        /// </summary>
        private string BuildBatchJson(List<EventData> events)
        {
            var sb = new StringBuilder();
            sb.Append("{\"events\":[");
            for (int i = 0; i < events.Count; i++)
            {
                if (i > 0) sb.Append(",");
                sb.Append(BuildEventJson(events[i]));
            }
            sb.Append("]}");
            return sb.ToString();
        }

        private string BuildEventJson(EventData evt)
        {
            var sb = new StringBuilder();
            sb.Append("{");
            sb.Append($"\"event_id\":\"{Serialization.JsonSerializer.EscapeJson(evt.event_id)}\"");
            sb.Append($",\"event_type\":\"{Serialization.JsonSerializer.EscapeJson(evt.event_type)}\"");
            sb.Append($",\"event_name\":\"{Serialization.JsonSerializer.EscapeJson(evt.event_name)}\"");
            sb.Append($",\"event_timestamp\":{evt.event_timestamp}");

            if (!string.IsNullOrEmpty(evt.event_version))
                sb.Append($",\"event_version\":\"{Serialization.JsonSerializer.EscapeJson(evt.event_version)}\"");

            if (!string.IsNullOrEmpty(evt.app_version))
                sb.Append($",\"app_version\":\"{Serialization.JsonSerializer.EscapeJson(evt.app_version)}\"");

            if (evt.event_data != null && evt.event_data.Count > 0)
            {
                sb.Append(",\"event_data\":");
                Serialization.JsonSerializer.AppendValue(sb, evt.event_data);
            }

            sb.Append("}");
            return sb.ToString();
        }
    }
}
