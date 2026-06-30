using System;
using System.Collections;
using System.Text;
using Amazon.Runtime;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace GAP.Editor
{
    /// <summary>
    /// Client for the GAP admin API. Handles application and API key management
    /// via IAM-authenticated (SigV4) requests to the admin API Gateway endpoint.
    /// </summary>
    public static class GAPAdminClient
    {
        /// <summary>
        /// Creates a new GAP application.
        /// </summary>
        public static void CreateApplication(GAPSettings settings, AWSCredentials credentials,
            string appName, string description, Action<bool, string, string> callback)
        {
            if (string.IsNullOrEmpty(settings.apiEndpoint))
            {
                callback?.Invoke(false, "API endpoint not configured", null);
                return;
            }

            EditorCoroutineUtility.StartCoroutine(
                CreateApplicationCoroutine(settings, credentials, appName, description, callback), null);
        }

        private static IEnumerator CreateApplicationCoroutine(GAPSettings settings, AWSCredentials credentials,
            string appName, string description, Action<bool, string, string> callback)
        {
            string url = $"{settings.apiEndpoint.TrimEnd('/')}/applications";
            var requestData = new ApplicationRequest { Name = appName, Description = description };
            string jsonData = JsonUtility.ToJson(requestData);
            Debug.Log($"[GAP:Admin] CreateApplication — POST {url}");

            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonData);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.certificateHandler = new BypassCertificateHandler();

                if (!GAPSigV4Signer.Sign(request, "POST", url, jsonData, credentials, settings.awsRegion))
                {
                    Debug.LogError("[GAP:Admin] CreateApplication — SigV4 signing failed");
                    callback?.Invoke(false, "Failed to sign request — check your credentials.", null);
                    yield break;
                }

                yield return request.SendWebRequest();

                Debug.Log($"[GAP:Admin] CreateApplication — responseCode: {request.responseCode}, result: {request.result}");

                if (request.result == UnityWebRequest.Result.Success)
                {
                    var response = JsonUtility.FromJson<ApplicationResponse>(request.downloadHandler.text);
                    callback?.Invoke(true, "Application created successfully", response.ApplicationId);
                }
                else
                {
                    string detail = $"HTTP {request.responseCode}: {request.downloadHandler?.text ?? request.error}";
                    Debug.LogError($"[GAP:Admin] CreateApplication — failed: {detail}");
                    callback?.Invoke(false, detail, null);
                }
            }
        }

        /// <summary>
        /// Creates an API key for the specified application.
        /// </summary>
        public static void CreateAPIKey(GAPSettings settings, AWSCredentials credentials,
            string applicationId, string keyName, string description, Action<bool, string, string> callback)
        {
            if (string.IsNullOrEmpty(settings.apiEndpoint))
            {
                callback?.Invoke(false, "API endpoint not configured", null);
                return;
            }

            EditorCoroutineUtility.StartCoroutine(
                CreateAPIKeyCoroutine(settings, credentials, applicationId, keyName, description, callback), null);
        }

        private static IEnumerator CreateAPIKeyCoroutine(GAPSettings settings, AWSCredentials credentials,
            string applicationId, string keyName, string description, Action<bool, string, string> callback)
        {
            string url = $"{settings.apiEndpoint.TrimEnd('/')}/applications/{applicationId}/authorizations";
            var requestData = new APIKeyRequest { Name = keyName, Description = description };
            string jsonData = JsonUtility.ToJson(requestData);
            Debug.Log($"[GAP:Admin] CreateAPIKey — POST {url}");

            using (var request = new UnityWebRequest(url, "POST"))
            {
                byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonData);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.certificateHandler = new BypassCertificateHandler();

                if (!GAPSigV4Signer.Sign(request, "POST", url, jsonData, credentials, settings.awsRegion))
                {
                    Debug.LogError("[GAP:Admin] CreateAPIKey — SigV4 signing failed");
                    callback?.Invoke(false, "Failed to sign request — check your credentials.", null);
                    yield break;
                }

                yield return request.SendWebRequest();

                Debug.Log($"[GAP:Admin] CreateAPIKey — responseCode: {request.responseCode}, result: {request.result}");

                if (request.result == UnityWebRequest.Result.Success)
                {
                    var response = JsonUtility.FromJson<APIKeyResponse>(request.downloadHandler.text);
                    callback?.Invoke(true, "API key created successfully", response.ApiKeyValue);
                }
                else
                {
                    string detail = $"HTTP {request.responseCode}: {request.downloadHandler?.text ?? request.error}";
                    Debug.LogError($"[GAP:Admin] CreateAPIKey — failed: {detail}");
                    callback?.Invoke(false, detail, null);
                }
            }
        }

        // ---- DTOs ----

        [Serializable]
        private class ApplicationRequest
        {
            public string Name;
            public string Description;
        }

        [Serializable]
        private class ApplicationResponse
        {
            public string ApplicationId;
        }

        [Serializable]
        private class APIKeyRequest
        {
            public string Name;
            public string Description;
        }

        [Serializable]
        private class APIKeyResponse
        {
            public string ApiKeyValue;
        }
    }
}
