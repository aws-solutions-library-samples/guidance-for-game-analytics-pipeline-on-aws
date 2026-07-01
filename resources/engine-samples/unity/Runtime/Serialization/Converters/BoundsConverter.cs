using System;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization.Converters
{
    /// <summary>
    /// Converts UnityEngine.Bounds to/from JSON-compatible dictionary representation.
    /// Delegates center and size serialization to Vector3Converter via the registry.
    /// </summary>
    public class BoundsConverter : ITypeConverter
    {
        public Type HandledType => typeof(Bounds);
        public string TypeTag => "UnityEngine.Bounds";

        public Dictionary<string, object> Serialize(object value)
        {
            var b = (Bounds)value;
            var vec3Conv = TypeConverterRegistry.Instance.GetConverterForType(typeof(Vector3));

            if (vec3Conv != null)
            {
                return new Dictionary<string, object>
                {
                    { TypeSerializer.TypeTagKey, TypeTag },
                    { "center", vec3Conv.Serialize(b.center) },
                    { "size", vec3Conv.Serialize(b.size) }
                };
            }

            // Fallback: manual serialization if Vector3Converter is not registered
            return new Dictionary<string, object>
            {
                { TypeSerializer.TypeTagKey, TypeTag },
                { "center", new Dictionary<string, object>
                    {
                        { "x", (double)b.center.x },
                        { "y", (double)b.center.y },
                        { "z", (double)b.center.z }
                    }
                },
                { "size", new Dictionary<string, object>
                    {
                        { "x", (double)b.size.x },
                        { "y", (double)b.size.y },
                        { "z", (double)b.size.z }
                    }
                }
            };
        }

        public object Deserialize(Dictionary<string, object> data)
        {
            if (data == null)
                return default(Bounds);

            if (!data.TryGetValue("center", out object centerObj) ||
                !data.TryGetValue("size", out object sizeObj))
            {
                return default(Bounds);
            }

            var centerDict = centerObj as Dictionary<string, object>;
            var sizeDict = sizeObj as Dictionary<string, object>;

            if (centerDict == null || sizeDict == null)
                return default(Bounds);

            var vec3Conv = TypeConverterRegistry.Instance.GetConverterForType(typeof(Vector3));

            Vector3 center;
            Vector3 size;

            if (vec3Conv != null)
            {
                object centerResult = vec3Conv.Deserialize(centerDict);
                object sizeResult = vec3Conv.Deserialize(sizeDict);

                center = (centerResult is Vector3 cv) ? cv : Vector3.zero;
                size = (sizeResult is Vector3 sv) ? sv : Vector3.zero;
            }
            else
            {
                // Fallback: manual extraction if Vector3Converter is not registered
                center = new Vector3(
                    GetFloat(centerDict, "x"),
                    GetFloat(centerDict, "y"),
                    GetFloat(centerDict, "z")
                );
                size = new Vector3(
                    GetFloat(sizeDict, "x"),
                    GetFloat(sizeDict, "y"),
                    GetFloat(sizeDict, "z")
                );
            }

            return new Bounds(center, size);
        }

        /// <summary>
        /// Safely extracts a float value from a dictionary, handling double, long, float, and int conversions.
        /// Returns 0f if the key is missing or the value cannot be converted.
        /// </summary>
        private static float GetFloat(Dictionary<string, object> data, string key)
        {
            if (data.TryGetValue(key, out object val))
            {
                if (val is double d) return (float)d;
                if (val is long l) return (float)l;
                if (val is float f) return f;
                if (val is int i) return (float)i;
            }
            return 0f;
        }
    }
}
