using System;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization.Converters
{
    /// <summary>
    /// Converts UnityEngine.Vector2Int to/from JSON-compatible dictionary representation.
    /// Serializes integer components as longs since that's what the JSON parser produces.
    /// </summary>
    public class Vector2IntConverter : ITypeConverter
    {
        public Type HandledType => typeof(Vector2Int);
        public string TypeTag => "UnityEngine.Vector2Int";

        public Dictionary<string, object> Serialize(object value)
        {
            var v = (Vector2Int)value;
            return new Dictionary<string, object>
            {
                { TypeSerializer.TypeTagKey, TypeTag },
                { "x", (long)v.x },
                { "y", (long)v.y }
            };
        }

        public object Deserialize(Dictionary<string, object> data)
        {
            if (data == null)
                return Vector2Int.zero;

            int x = GetInt(data, "x");
            int y = GetInt(data, "y");
            return new Vector2Int(x, y);
        }

        /// <summary>
        /// Safely extracts an int value from a dictionary, handling long, int, and double conversions.
        /// Returns 0 if the key is missing or the value cannot be converted.
        /// </summary>
        private static int GetInt(Dictionary<string, object> data, string key)
        {
            if (data.TryGetValue(key, out object val))
            {
                if (val is long l) return (int)l;
                if (val is int i) return i;
                if (val is double d) return (int)d;
            }
            return 0;
        }
    }
}
