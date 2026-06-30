using System;
using System.Collections.Generic;
using System.Text;
using Amazon.Runtime;
using Amazon.Runtime.Internal.Auth;
using Amazon.Runtime.Internal.Util;
using Amazon.Util;
using UnityEngine;
using UnityEngine.Networking;

namespace GAP.Editor
{
    /// <summary>
    /// Applies AWS SigV4 signing headers to a UnityWebRequest for IAM-authenticated
    /// API Gateway endpoints. Uses AWSSDK.Core.dll's official signing implementation
    /// rather than hand-rolling crypto.
    /// </summary>
    internal static class GAPSigV4Signer
    {
        private const string Service = "execute-api";

        /// <summary>
        /// Signs the given request by adding x-amz-date, Authorization, and
        /// (if using temporary credentials) x-amz-security-token headers.
        /// </summary>
        /// <returns>True if signing succeeded; false on error.</returns>
        public static bool Sign(UnityWebRequest request, string method, string url,
            string body, AWSCredentials credentials, string region)
        {
            try
            {
                var creds = credentials.GetCredentials();
                var uri = new Uri(url);
                string host = uri.Host;
                string path = string.IsNullOrEmpty(uri.AbsolutePath) ? "/" : uri.AbsolutePath;

                // Use clock-skew corrected time, matching SDK's AWS4Signer.InitializeHeaders.
                // AWS rejects requests where the timestamp differs from server time by >5 minutes.
                var now = CorrectClockSkew.GetCorrectedUtcNowForEndpoint(url);
                string amzDate = now.ToUniversalTime()
                    .ToString(AWSSDKUtils.ISO8601BasicDateTimeFormat, System.Globalization.CultureInfo.InvariantCulture);

                bool hasToken = !string.IsNullOrEmpty(creds.Token);

                // Build sorted headers matching AWS4Signer.SortAndPruneHeaders —
                // StringComparer.Ordinal, all keys lowercase.
                var headers = new SortedDictionary<string, string>(StringComparer.Ordinal)
                {
                    { "host", host },
                    { "x-amz-date", amzDate }
                };
                if (hasToken)
                    headers["x-amz-security-token"] = creds.Token;

                // Canonical headers and signed headers, matching AWS4Signer.CanonicalizeHeaders
                var canonicalHeadersSb = new StringBuilder();
                var signedHeadersSb = new StringBuilder();
                foreach (var kvp in headers)
                {
                    canonicalHeadersSb.Append($"{kvp.Key}:{kvp.Value.Trim()}\n");
                    if (signedHeadersSb.Length > 0) signedHeadersSb.Append(';');
                    signedHeadersSb.Append(kvp.Key);
                }
                string canonicalHeaders = canonicalHeadersSb.ToString();
                string signedHeaders = signedHeadersSb.ToString();

                // Payload hash using SDK's ComputeHash, matching AWS4Signer.SetRequestBodyHash
                byte[] bodyBytes = Encoding.UTF8.GetBytes(body ?? "");
                string payloadHash = AWSSDKUtils.ToHex(AWS4Signer.ComputeHash(bodyBytes), true);

                // Canonical request, matching AWS4Signer.CanonicalizeRequest
                string canonicalRequest = $"{method}\n{path}\n\n{canonicalHeaders}\n{signedHeaders}\n{payloadHash}";

                // Compute signature using the SDK's official implementation
                var signingResult = AWS4Signer.ComputeSignature(
                    creds.AccessKey,
                    creds.SecretKey,
                    region,
                    now,
                    Service,
                    signedHeaders,
                    canonicalRequest);

                request.SetRequestHeader("x-amz-date", amzDate);
                request.SetRequestHeader("Authorization", signingResult.ForAuthorizationHeader);
                if (hasToken)
                    request.SetRequestHeader("x-amz-security-token", creds.Token);

                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[GAP:SigV4] Signing failed: {e.Message}");
                return false;
            }
        }
    }
}
