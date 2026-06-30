using System;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization.Converters
{
    /// <summary>
    /// Converts UnityEngine.Vector3 to/from JSON-compatible dictionary representation.
    /// Serializes float components as doubles for JSON precision.
    /// </summary>
    public class Vector3Converter : ITypeConverter
    {
        public Type HandledType => typeof(Vector3);
        public string TypeTag => "UnityEngine.Vector3";

        public Dictionary<string, object> Serialize(object value)
        {
            var v = (Vector3)value;
            return new Dictionary<string, object>
            {
                { TypeSerializer.TypeTagKey, TypeTag },
                { "x", (double)v.x },
                { "y", (double)v.y },
                { "z", (double)v.z }
            };
        }

        public object Deserialize(Dictionary<string, object> data)
        {
            if (data == null)
                return Vector3.zero;

            float x = GetFloat(data, "x");
            float y = GetFloat(data, "y");
            float z = GetFloat(data, "z");
            return new Vector3(x, y, z);
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
