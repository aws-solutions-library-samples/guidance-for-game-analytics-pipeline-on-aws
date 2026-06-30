using System;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization.Converters
{
    /// <summary>
    /// Converts UnityEngine.Color to/from JSON-compatible dictionary representation.
    /// Serializes float components as doubles for JSON precision.
    /// </summary>
    public class ColorConverter : ITypeConverter
    {
        public Type HandledType => typeof(Color);
        public string TypeTag => "UnityEngine.Color";

        public Dictionary<string, object> Serialize(object value)
        {
            var c = (Color)value;
            return new Dictionary<string, object>
            {
                { TypeSerializer.TypeTagKey, TypeTag },
                { "r", (double)c.r },
                { "g", (double)c.g },
                { "b", (double)c.b },
                { "a", (double)c.a }
            };
        }

        public object Deserialize(Dictionary<string, object> data)
        {
            if (data == null)
                return new Color(0, 0, 0, 0);

            float r = GetFloat(data, "r");
            float g = GetFloat(data, "g");
            float b = GetFloat(data, "b");
            float a = GetFloat(data, "a");
            return new Color(r, g, b, a);
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
