using System;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization.Converters
{
    /// <summary>
    /// Converts UnityEngine.Quaternion to/from JSON-compatible dictionary representation.
    /// Serializes float components as doubles for JSON precision.
    /// </summary>
    public class QuaternionConverter : ITypeConverter
    {
        public Type HandledType => typeof(Quaternion);
        public string TypeTag => "UnityEngine.Quaternion";

        public Dictionary<string, object> Serialize(object value)
        {
            var q = (Quaternion)value;
            return new Dictionary<string, object>
            {
                { TypeSerializer.TypeTagKey, TypeTag },
                { "x", (double)q.x },
                { "y", (double)q.y },
                { "z", (double)q.z },
                { "w", (double)q.w }
            };
        }

        public object Deserialize(Dictionary<string, object> data)
        {
            if (data == null)
                return Quaternion.identity;

            float x = GetFloat(data, "x");
            float y = GetFloat(data, "y");
            float z = GetFloat(data, "z");
            float w = GetFloat(data, "w");
            return new Quaternion(x, y, z, w);
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
