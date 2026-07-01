using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Amazon;
using Amazon.CloudFormation;
using Amazon.CloudFormation.Model;
using Amazon.Runtime;
using UnityEngine;

namespace GAP.Editor
{
    /// <summary>
    /// Discovered GAP stack info extracted from CloudFormation outputs.
    /// </summary>
    public class GAPStackInfo
    {
        public string StackName;
        public string ApiEndpoint;
        public string Region;
        public string AdminPolicyName;
        public string AnalyticsBucketName;
    }

    /// <summary>
    /// Discovers deployed GAP CloudFormation stacks using the AWS SDK.
    /// </summary>
    public static class GAPCloudFormationDiscovery
    {
        /// <summary>
        /// Searches for GAP stacks in the given region by looking for stacks
        /// with an output key containing "ApiEndpoint".
        /// </summary>
        public static async Task<List<GAPStackInfo>> DiscoverStacks(
            AWSCredentials credentials, string regionName)
        {
            Debug.Log($"[GAP:Discovery] Starting CloudFormation stack discovery in region '{regionName}'");
            var region = RegionEndpoint.GetBySystemName(regionName);
            var client = new AmazonCloudFormationClient(credentials, region);
            var results = new List<GAPStackInfo>();

            try
            {
                string nextToken = null;
                int totalStacksScanned = 0;
                do
                {
                    var request = new DescribeStacksRequest();
                    if (!string.IsNullOrEmpty(nextToken))
                        request.NextToken = nextToken;

                    Debug.Log($"[GAP:Discovery] Calling DescribeStacks (nextToken: {(string.IsNullOrEmpty(nextToken) ? "null" : "present")})");
                    var response = await client.DescribeStacksAsync(request);
                    Debug.Log($"[GAP:Discovery] DescribeStacks returned {response.Stacks.Count} stacks in this page");

                    foreach (var stack in response.Stacks)
                    {
                        totalStacksScanned++;
                        Debug.Log($"[GAP:Discovery]   Scanning stack: '{stack.StackName}' (status: {stack.StackStatus})");

                        // Skip stacks that are being deleted or failed
                        if (stack.StackStatus == StackStatus.DELETE_COMPLETE ||
                            stack.StackStatus == StackStatus.DELETE_IN_PROGRESS)
                        {
                            Debug.Log($"[GAP:Discovery]   Skipping '{stack.StackName}' — status is {stack.StackStatus}");
                            continue;
                        }

                        if (stack.Outputs != null && stack.Outputs.Count > 0)
                        {
                            Debug.Log($"[GAP:Discovery]   Stack '{stack.StackName}' has {stack.Outputs.Count} outputs:");
                            foreach (var output in stack.Outputs)
                            {
                                Debug.Log($"[GAP:Discovery]     {output.OutputKey} = {output.OutputValue}");
                            }
                        }
                        else
                        {
                            Debug.Log($"[GAP:Discovery]   Stack '{stack.StackName}' has no outputs");
                        }

                        var apiEndpointOutput = stack.Outputs?
                            .FirstOrDefault(o => o.OutputKey != null &&
                                o.OutputKey.Contains("ApiEndpoint"));

                        if (apiEndpointOutput != null)
                        {
                            Debug.Log($"[GAP:Discovery]   ✓ MATCH — found ApiEndpoint output in '{stack.StackName}': {apiEndpointOutput.OutputValue}");
                            var info = new GAPStackInfo
                            {
                                StackName = stack.StackName,
                                ApiEndpoint = apiEndpointOutput.OutputValue,
                                Region = regionName
                            };

                            // Extract optional outputs
                            var adminPolicy = stack.Outputs?
                                .FirstOrDefault(o => o.OutputKey != null &&
                                    o.OutputKey.Contains("AdminApiAccessPolicyName"));
                            if (adminPolicy != null)
                            {
                                info.AdminPolicyName = adminPolicy.OutputValue;
                                Debug.Log($"[GAP:Discovery]     AdminPolicyName: {adminPolicy.OutputValue}");
                            }

                            var bucket = stack.Outputs?
                                .FirstOrDefault(o => o.OutputKey != null &&
                                    o.OutputKey.Contains("AnalyticsBucketName"));
                            if (bucket != null)
                            {
                                info.AnalyticsBucketName = bucket.OutputValue;
                                Debug.Log($"[GAP:Discovery]     AnalyticsBucketName: {bucket.OutputValue}");
                            }

                            results.Add(info);
                        }
                        else
                        {
                            Debug.Log($"[GAP:Discovery]   ✗ No ApiEndpoint output in '{stack.StackName}'");
                        }
                    }

                    nextToken = response.NextToken;
                } while (!string.IsNullOrEmpty(nextToken));

                Debug.Log($"[GAP:Discovery] Discovery complete — scanned {totalStacksScanned} stacks, found {results.Count} GAP stack(s)");
            }
            catch (Exception e)
            {
                Debug.LogError($"[GAP:Discovery] CloudFormation discovery failed: {e.GetType().Name}: {e.Message}\n{e.StackTrace}");
                throw;
            }
            finally
            {
                client.Dispose();
            }

            return results;
        }
    }
}
