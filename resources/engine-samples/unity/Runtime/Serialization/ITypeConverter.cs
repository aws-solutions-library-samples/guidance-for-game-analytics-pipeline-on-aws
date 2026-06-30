using System;
using System.Collections.Generic;

namespace GAP.Serialization
{
    /// <summary>
    /// Contract for bidirectional type conversion between Unity types
    /// and JSON-compatible dictionary representations.
    /// </summary>
    public interface ITypeConverter
    {
        /// <summary>
        /// The System.Type this converter handles.
        /// </summary>
        Type HandledType { get; }

        /// <summary>
        /// The type tag string used in JSON to identify this type.
        /// Must be unique across all registered converters.
        /// </summary>
        string TypeTag { get; }

        /// <summary>
        /// Serializes a value to a JSON-compatible dictionary.
        /// The returned dictionary MUST contain the "__type" key with the TypeTag value.
        /// All values in the dictionary must be JSON-safe primitives or nested dictionaries.
        /// </summary>
        /// <param name="value">The typed value to serialize.</param>
        /// <returns>A dictionary containing the type tag and serialized fields.</returns>
        Dictionary<string, object> Serialize(object value);

        /// <summary>
        /// Deserializes a dictionary (with __type tag already verified) back to the typed value.
        /// Returns null if the dictionary is malformed.
        /// </summary>
        /// <param name="data">The dictionary containing serialized fields and a verified __type tag.</param>
        /// <returns>The reconstructed typed value, or null if the data is malformed.</returns>
        object Deserialize(Dictionary<string, object> data);
    }
}
