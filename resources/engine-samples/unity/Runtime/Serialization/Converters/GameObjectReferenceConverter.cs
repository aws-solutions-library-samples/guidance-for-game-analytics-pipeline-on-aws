using System;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization.Converters
{
    /// <summary>
    /// Converts UnityEngine.GameObject to a JSON-compatible dictionary containing
    /// reference metadata (name, tag, instanceId). Deserialization returns the raw
    /// dictionary since GameObjects cannot be reconstructed from reference data alone.
    /// </summary>
    public class GameObjectReferenceConverter : ITypeConverter
    {
        public Type HandledType => typeof(GameObject);
        public string TypeTag => "UnityEngine.GameObject";

        public Dictionary<string, object> Serialize(object value)
        {
            var go = value as GameObject;

            if (go == null)
            {
                return new Dictionary<string, object>
                {
                    { TypeSerializer.TypeTagKey, TypeTag },
                    { "name", null },
                    { "tag", null },
                    { "instanceId", null }
                };
            }

            return new Dictionary<string, object>
            {
                { TypeSerializer.TypeTagKey, TypeTag },
                { "name", go.name },
                { "tag", go.tag },
                { "instanceId", (long)go.GetInstanceID() }
            };
        }

        public object Deserialize(Dictionary<string, object> data)
        {
            // Cannot reconstruct a GameObject from reference data.
            // Return the raw dictionary so the caller can use name/tag/instanceId for lookup.
            return data;
        }
    }
}
