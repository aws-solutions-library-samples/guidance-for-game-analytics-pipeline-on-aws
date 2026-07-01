using System;
using System.Collections;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace GAP.Editor
{
    /// <summary>
    /// Tests the runtime connection to the GAP events endpoint using the same
    /// code path as the plugin — POST to /events with the configured API key.
    /// Validates endpoint, application ID, and API key in one shot.
    /// </summary>
    public static class GAPConnectionTester
    {
        public static void TestConnection(GAPSettings settings, Action<bool, string> callback)
        {
            if (string.IsNullOrEmpty(settings.apiEndpoint))
            {
                callback?.Invoke(false, "API endpoint not configured");
                return;
            }

            if (string.IsNullOrEmpty(settings.applicationId))
            {
                callback?.Invoke(false, "Application ID not configured");
                return;
            }

            if (string.IsNullOrEmpty(settings.apiKey))
            {
                callback?.Invoke(false, "API key not configured");
                return;
            }

            EditorCoroutineUtility.StartCoroutine(TestConnectionCoroutine(settings, callback), null);
        }

        private static IEnumerator TestConnectionCoroutine(GAPSettings settings, Action<bool, string> callback)
        {
            string url = $"{settings.apiEndpoint.TrimEnd('/')}/applications/{settings.applicationId}/events";
            string jsonBody = BuildTestEventJson();
            Debug.Log($"[GAP:Tester] TestConnection — POST {url}");

            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonBody);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", settings.apiKey);

                yield return request.SendWebRequest();

                Debug.Log($"[GAP:Tester] TestConnection — responseCode: {request.responseCode}, result: {request.result}");

                if (request.result == UnityWebRequest.Result.Success)
                {
                    callback?.Invoke(true, $"Connection successful! ({request.responseCode})");
                }
                else
                {
                    string detail = $"HTTP {request.responseCode}: {request.downloadHandler?.text ?? request.error}";
                    Debug.LogError($"[GAP:Tester] TestConnection — failed: {detail}");
                    callback?.Invoke(false, detail);
                }
            }
        }

        private static string BuildTestEventJson()
        {
            string eventId = Guid.NewGuid().ToString();
            long timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            return $"{{\"events\":[{{" +
                   $"\"event_id\":\"{eventId}\"," +
                   $"\"event_type\":\"editor_connection_test\"," +
                   $"\"event_name\":\"editor_connection_test\"," +
                   $"\"event_timestamp\":{timestamp}," +
                   $"\"event_version\":\"1.0\"," +
                   $"\"app_version\":\"editor\"," +
                   $"\"event_data\":{{\"source\":\"editor_test\"}}" +
                   $"}}]}}";
        }
    }
}
