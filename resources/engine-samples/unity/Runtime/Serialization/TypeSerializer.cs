using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization
{
    /// <summary>
    /// Static facade that orchestrates serialization/deserialization of event_data dictionaries.
    /// Handles recursion into nested dictionaries and arrays.
    /// Never throws exceptions to calling code; logs warnings and degrades gracefully.
    /// </summary>
    public static class TypeSerializer
    {
        /// <summary>
        /// Type tag key used in serialized dictionaries to identify the Unity type.
        /// </summary>
        public const string TypeTagKey = "__type";

        /// <summary>
        /// Maximum recursion depth to prevent stack overflow from circular references
        /// or deeply nested structures.
        /// </summary>
        private const int MaxRecursionDepth = 32;

        /// <summary>
        /// Serializes all Unity type values in the dictionary to JSON-compatible representations.
        /// Modifies the dictionary in-place, replacing typed values with their serialized form.
        /// Recursively processes nested dictionaries and lists/arrays.
        /// </summary>
        /// <param name="eventData">The event data dictionary to serialize.</param>
        /// <returns>The same dictionary with Unity type values replaced by serialized dictionaries, or null if input is null.</returns>
        public static Dictionary<string, object> SerializeEventData(Dictionary<string, object> eventData)
        {
            if (eventData == null)
                return null;

            try
            {
                var keys = new List<string>(eventData.Keys);
                foreach (var key in keys)
                {
                    eventData[key] = SerializeValue(eventData[key], 0);
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[GAP:TypeSerializer] Exception during SerializeEventData: {ex.Message}");
            }

            return eventData;
        }

        /// <summary>
        /// Deserializes all typed dictionaries (those containing __type tags) back to Unity types.
        /// Modifies the dictionary in-place, replacing serialized dictionaries with typed values.
        /// Recursively processes nested dictionaries and lists/arrays.
        /// </summary>
        /// <param name="eventData">The event data dictionary to deserialize.</param>
        /// <returns>The same dictionary with serialized dictionaries replaced by Unity type values, or null if input is null.</returns>
        public static Dictionary<string, object> DeserializeEventData(Dictionary<string, object> eventData)
        {
            if (eventData == null)
                return null;

            try
            {
                var keys = new List<string>(eventData.Keys);
                foreach (var key in keys)
                {
                    eventData[key] = DeserializeValue(eventData[key], 0);
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[GAP:TypeSerializer] Exception during DeserializeEventData: {ex.Message}");
            }

            return eventData;
        }

        /// <summary>
        /// Serializes a single value. Returns the serialized dictionary if a converter exists,
        /// or the original value if it's already JSON-safe, or ToString() as fallback.
        /// </summary>
        /// <param name="value">The value to serialize.</param>
        /// <param name="depth">Current recursion depth.</param>
        /// <returns>The serialized representation of the value.</returns>
        internal static object SerializeValue(object value, int depth = 0)
        {
            if (depth > MaxRecursionDepth)
            {
                Debug.LogWarning("[GAP:TypeSerializer] Maximum recursion depth exceeded during serialization, returning value as-is");
                return value;
            }

            if (value == null)
                return null;

            if (IsJsonSafePrimitive(value))
                return value;

            // Check if a converter is registered for this type
            var converter = TypeConverterRegistry.Instance.GetConverterForType(value.GetType());
            if (converter != null)
            {
                try
                {
                    return converter.Serialize(value);
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[GAP:TypeSerializer] Converter for type '{value.GetType().Name}' threw exception during serialization: {ex.Message}, using ToString() fallback");
                    return value.ToString();
                }
            }

            // Recurse into nested dictionaries
            if (value is Dictionary<string, object> dict)
            {
                var keys = new List<string>(dict.Keys);
                foreach (var key in keys)
                {
                    dict[key] = SerializeValue(dict[key], depth + 1);
                }
                return dict;
            }

            // Recurse into lists/arrays
            if (value is IList list)
            {
                var result = new List<object>();
                foreach (var item in list)
                {
                    result.Add(SerializeValue(item, depth + 1));
                }
                return result;
            }

            // Fallback: no converter registered, not a primitive, not a collection
            var typeName = value.GetType().FullName ?? value.GetType().Name;
            Debug.LogWarning($"[GAP:TypeSerializer] No converter registered for type '{typeName}', using ToString() fallback");
            return value.ToString();
        }

        /// <summary>
        /// Deserializes a single value. If it's a dictionary with a __type tag, reconstructs
        /// the typed value. Otherwise returns the value unchanged.
        /// </summary>
        /// <param name="value">The value to deserialize.</param>
        /// <param name="depth">Current recursion depth.</param>
        /// <returns>The deserialized value.</returns>
        internal static object DeserializeValue(object value, int depth = 0)
        {
            if (depth > MaxRecursionDepth)
            {
                Debug.LogWarning("[GAP:TypeSerializer] Maximum recursion depth exceeded during deserialization, returning value as-is");
                return value;
            }

            if (value == null)
                return null;

            // Check if value is a dictionary with a type tag
            if (value is Dictionary<string, object> dict)
            {
                if (dict.TryGetValue(TypeTagKey, out object tagObj) && tagObj is string tag)
                {
                    var converter = TypeConverterRegistry.Instance.GetConverterForTag(tag);
                    if (converter != null)
                    {
                        try
                        {
                            return converter.Deserialize(dict);
                        }
                        catch (Exception ex)
                        {
                            Debug.LogWarning($"[GAP:TypeSerializer] Converter for tag '{tag}' threw exception during deserialization: {ex.Message}, returning raw dictionary");
                            return dict;
                        }
                    }
                    else
                    {
                        Debug.LogWarning($"[GAP:TypeSerializer] Unknown type tag '{tag}' during deserialization, returning raw dictionary");
                        return dict;
                    }
                }

                // No type tag — recurse into each value
                var keys = new List<string>(dict.Keys);
                foreach (var key in keys)
                {
                    dict[key] = DeserializeValue(dict[key], depth + 1);
                }
                return dict;
            }

            // Recurse into lists/arrays
            if (value is IList list)
            {
                var result = new List<object>();
                foreach (var item in list)
                {
                    result.Add(DeserializeValue(item, depth + 1));
                }
                return result;
            }

            // Otherwise return as-is
            return value;
        }

        /// <summary>
        /// Returns true if the value is a JSON-safe primitive that needs no conversion.
        /// </summary>
        private static bool IsJsonSafePrimitive(object value)
        {
            return value is null
                || value is string
                || value is bool
                || value is int
                || value is long
                || value is float
                || value is double
                || value is byte
                || value is short
                || value is uint
                || value is ulong;
        }
    }
}
