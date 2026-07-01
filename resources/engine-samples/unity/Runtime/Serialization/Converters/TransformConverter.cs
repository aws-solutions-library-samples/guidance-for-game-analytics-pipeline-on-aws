using System;
using System.Collections.Generic;
using UnityEngine;

namespace GAP.Serialization.Converters
{
    /// <summary>
    /// Converts UnityEngine.Transform to a JSON-compatible dictionary containing
    /// position, rotation, and localScale as nested serialized dictionaries.
    /// Deserialization returns the raw dictionary since Transforms cannot be
    /// reconstructed from data alone.
    /// </summary>
    public class TransformConverter : ITypeConverter
    {
        public Type HandledType => typeof(Transform);
        public string TypeTag => "UnityEngine.Transform";

        public Dictionary<string, object> Serialize(object value)
        {
            var transform = value as Transform;

            if (transform == null)
            {
                return new Dictionary<string, object>
                {
                    { TypeSerializer.TypeTagKey, TypeTag },
                    { "position", null },
                    { "rotation", null },
                    { "localScale", null }
                };
            }

            var vec3Conv = TypeConverterRegistry.Instance.GetConverterForType(typeof(Vector3));
            var quatConv = TypeConverterRegistry.Instance.GetConverterForType(typeof(Quaternion));

            if (vec3Conv != null && quatConv != null)
            {
                return new Dictionary<string, object>
                {
                    { TypeSerializer.TypeTagKey, TypeTag },
                    { "position", vec3Conv.Serialize(transform.position) },
                    { "rotation", quatConv.Serialize(transform.rotation) },
                    { "localScale", vec3Conv.Serialize(transform.localScale) }
                };
            }

            // Fallback: manual serialization if converters are not registered
            return new Dictionary<string, object>
            {
                { TypeSerializer.TypeTagKey, TypeTag },
                { "position", new Dictionary<string, object>
                    {
                        { "x", (double)transform.position.x },
                        { "y", (double)transform.position.y },
                        { "z", (double)transform.position.z }
                    }
                },
                { "rotation", new Dictionary<string, object>
                    {
                        { "x", (double)transform.rotation.x },
                        { "y", (double)transform.rotation.y },
                        { "z", (double)transform.rotation.z },
                        { "w", (double)transform.rotation.w }
                    }
                },
                { "localScale", new Dictionary<string, object>
                    {
                        { "x", (double)transform.localScale.x },
                        { "y", (double)transform.localScale.y },
                        { "z", (double)transform.localScale.z }
                    }
                }
            };
        }

        public object Deserialize(Dictionary<string, object> data)
        {
            // Cannot reconstruct a Transform from data.
            // Return the raw dictionary containing nested position/rotation/scale
            // dicts that can be individually deserialized by the caller.
            return data;
        }
    }
}
