using System;
using System.Collections.Generic;
using System.Linq;
using Amazon;
using Amazon.Runtime;
using Amazon.Runtime.CredentialManagement;
using UnityEngine;

namespace GAP.Editor
{
    /// <summary>
    /// Credential resolution modes for the GAP plugin
    /// </summary>
    public enum CredentialMode
    {
        Explicit,
        DefaultOrEnvironment,
        Profile
    }

    /// <summary>
    /// Thin wrapper around the AWS SDK credential resolution.
    /// Lists profiles, resolves credentials based on GAPSettings.credentialMode.
    /// </summary>
    public static class AWSCredentialHelper
    {
        /// <summary>
        /// Returns all profile names found in ~/.aws/credentials and ~/.aws/config
        /// </summary>
        public static string[] ListProfiles()
        {
            Debug.Log("[GAP:Credentials] Listing AWS profiles from credential store chain...");
            var names = new HashSet<string>();
            try
            {
                var chain = new CredentialProfileStoreChain();
                var profiles = chain.ListProfiles();
                foreach (var profile in profiles)
                {
                    names.Add(profile.Name);
                    Debug.Log($"[GAP:Credentials]   Found profile: '{profile.Name}'");
                }
                Debug.Log($"[GAP:Credentials] Total profiles found: {names.Count}");
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[GAP:Credentials] Could not read AWS profiles: {e.Message}\n{e.StackTrace}");
            }
            return names.OrderBy(n => n).ToArray();
        }

        /// <summary>
        /// Resolves AWS credentials based on the current GAPSettings configuration.
        /// </summary>
        public static AWSCredentials Resolve(GAPSettings settings)
        {
            Debug.Log($"[GAP:Credentials] Resolving credentials — mode: {settings.credentialMode}, region: {settings.awsRegion}");
            switch (settings.credentialMode)
            {
                case CredentialMode.Explicit:
                    Debug.Log("[GAP:Credentials] Using Explicit credential mode");
                    return ResolveExplicit(settings);

                case CredentialMode.Profile:
                    Debug.Log($"[GAP:Credentials] Using Profile credential mode — profile: '{settings.awsProfile}'");
                    return ResolveProfile(settings);

                case CredentialMode.DefaultOrEnvironment:
                default:
                    Debug.Log("[GAP:Credentials] Using DefaultOrEnvironment credential mode");
                    return ResolveDefault();
            }
        }

        /// <summary>
        /// Resolves the RegionEndpoint from settings.
        /// </summary>
        public static RegionEndpoint GetRegion(GAPSettings settings)
        {
            if (string.IsNullOrEmpty(settings.awsRegion))
                return RegionEndpoint.USEast1;
            return RegionEndpoint.GetBySystemName(settings.awsRegion);
        }

        private static AWSCredentials ResolveExplicit(GAPSettings settings)
        {
            if (string.IsNullOrEmpty(settings.awsAccessKey) || string.IsNullOrEmpty(settings.awsSecretKey))
            {
                Debug.LogError("[GAP:Credentials] Explicit mode — Access Key or Secret Key is empty");
                throw new InvalidOperationException(
                    "Credential mode is set to Explicit but AWS Access Key or Secret Key is empty. " +
                    "Configure them in Project Settings > Game Analytics Pipeline.");
            }

            if (!string.IsNullOrEmpty(settings.awsSessionToken))
            {
                Debug.Log($"[GAP:Credentials] Explicit mode — using SessionAWSCredentials (AccessKey: {settings.awsAccessKey.Substring(0, Math.Min(4, settings.awsAccessKey.Length))}..., has session token)");
                return new SessionAWSCredentials(
                    settings.awsAccessKey,
                    settings.awsSecretKey,
                    settings.awsSessionToken);
            }

            Debug.Log($"[GAP:Credentials] Explicit mode — using BasicAWSCredentials (AccessKey: {settings.awsAccessKey.Substring(0, Math.Min(4, settings.awsAccessKey.Length))}...)");
            return new BasicAWSCredentials(settings.awsAccessKey, settings.awsSecretKey);
        }

        private static AWSCredentials ResolveProfile(GAPSettings settings)
        {
            if (string.IsNullOrEmpty(settings.awsProfile))
            {
                Debug.LogError("[GAP:Credentials] Profile mode — no profile name selected");
                throw new InvalidOperationException(
                    "Credential mode is set to Profile but no profile name is selected. " +
                    "Choose a profile in Project Settings > Game Analytics Pipeline.");
            }

            Debug.Log($"[GAP:Credentials] Profile mode — attempting to resolve profile '{settings.awsProfile}'");
            var chain = new CredentialProfileStoreChain();
            if (chain.TryGetAWSCredentials(settings.awsProfile, out var credentials))
            {
                Debug.Log($"[GAP:Credentials] Profile mode — successfully resolved credentials for '{settings.awsProfile}' (type: {credentials.GetType().Name})");
                return credentials;
            }

            Debug.LogError($"[GAP:Credentials] Profile mode — failed to resolve credentials for '{settings.awsProfile}'");
            throw new InvalidOperationException(
                $"Could not resolve credentials for profile '{settings.awsProfile}'. " +
                "Ensure the profile exists in ~/.aws/credentials or ~/.aws/config. " +
                "If this is an SSO profile, run 'aws sso login --profile " +
                $"{settings.awsProfile}' in your terminal first.");
        }

        private static AWSCredentials ResolveDefault()
        {
            Debug.Log("[GAP:Credentials] Default mode — checking environment variables...");
            var envAccessKey = Environment.GetEnvironmentVariable("AWS_ACCESS_KEY_ID");
            var envRegion = Environment.GetEnvironmentVariable("AWS_DEFAULT_REGION") ?? Environment.GetEnvironmentVariable("AWS_REGION");
            var envProfile = Environment.GetEnvironmentVariable("AWS_PROFILE");
            Debug.Log($"[GAP:Credentials] Default mode — AWS_ACCESS_KEY_ID: {(string.IsNullOrEmpty(envAccessKey) ? "(not set)" : envAccessKey.Substring(0, Math.Min(4, envAccessKey.Length)) + "...")}, AWS_DEFAULT_REGION: {envRegion ?? "(not set)"}, AWS_PROFILE: {envProfile ?? "(not set)"}");

            try
            {
                var creds = FallbackCredentialsFactory.GetCredentials();
                Debug.Log($"[GAP:Credentials] Default mode — resolved credentials (type: {creds.GetType().Name})");
                return creds;
            }
            catch (Exception e)
            {
                Debug.LogError($"[GAP:Credentials] Default mode — failed to resolve: {e.Message}\n{e.StackTrace}");
                throw new InvalidOperationException(
                    "Could not resolve AWS credentials from the default credential chain. " +
                    "Ensure AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY environment variables are set, " +
                    "or run 'aws configure' to create a default profile. " +
                    $"Details: {e.Message}");
            }
        }
    }
}
