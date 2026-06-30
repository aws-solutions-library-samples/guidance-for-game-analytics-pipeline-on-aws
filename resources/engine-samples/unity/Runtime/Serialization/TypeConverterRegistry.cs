using System;
using System.Collections.Generic;

namespace GAP.Serialization
{
    /// <summary>
    /// Central registry mapping System.Type and type tag strings to ITypeConverter instances.
    /// Thread-safe for reads; registration is expected at initialization time.
    /// </summary>
    public class TypeConverterRegistry
    {
        private static TypeConverterRegistry _instance;

        /// <summary>
        /// Singleton instance of the TypeConverterRegistry.
        /// Lazily initialized on first access.
        /// </summary>
        public static TypeConverterRegistry Instance => _instance ??= new TypeConverterRegistry();

        // O(1) lookup by System.Type (for serialization)
        private readonly Dictionary<Type, ITypeConverter> _convertersByType;

        // O(1) lookup by type tag string (for deserialization)
        private readonly Dictionary<string, ITypeConverter> _convertersByTag;

        private TypeConverterRegistry()
        {
            _convertersByType = new Dictionary<Type, ITypeConverter>();
            _convertersByTag = new Dictionary<string, ITypeConverter>();
        }

        /// <summary>
        /// Registers a converter. If a converter for the same type already exists, it is replaced.
        /// This allows custom converters to override built-in converters.
        /// </summary>
        public void Register(ITypeConverter converter)
        {
            if (converter == null)
                return;

            // Remove old tag mapping if replacing an existing converter for this type
            if (_convertersByType.TryGetValue(converter.HandledType, out var existing))
            {
                _convertersByTag.Remove(existing.TypeTag);
            }

            _convertersByType[converter.HandledType] = converter;
            _convertersByTag[converter.TypeTag] = converter;
        }

        /// <summary>
        /// Unregisters the converter for the specified type.
        /// Returns true if a converter was removed, false if none was registered.
        /// </summary>
        public bool Unregister(Type type)
        {
            if (type == null)
                return false;

            if (_convertersByType.TryGetValue(type, out var converter))
            {
                _convertersByType.Remove(type);
                _convertersByTag.Remove(converter.TypeTag);
                return true;
            }

            return false;
        }

        /// <summary>
        /// Attempts to find a converter for the given System.Type.
        /// Returns null if no converter is registered.
        /// </summary>
        public ITypeConverter GetConverterForType(Type type)
        {
            if (type == null)
                return null;

            _convertersByType.TryGetValue(type, out var converter);
            return converter;
        }

        /// <summary>
        /// Attempts to find a converter for the given type tag string.
        /// Returns null if no converter is registered for that tag.
        /// </summary>
        public ITypeConverter GetConverterForTag(string typeTag)
        {
            if (string.IsNullOrEmpty(typeTag))
                return null;

            _convertersByTag.TryGetValue(typeTag, out var converter);
            return converter;
        }

        /// <summary>
        /// Registers all built-in Unity type converters.
        /// Called once during GAPInitializer startup.
        /// </summary>
        public void RegisterBuiltins()
        {
            Register(new Converters.Vector3Converter());
            Register(new Converters.Vector2Converter());
            Register(new Converters.QuaternionConverter());
            Register(new Converters.ColorConverter());
            Register(new Converters.BoundsConverter());
            Register(new Converters.Vector2IntConverter());
            Register(new Converters.Vector3IntConverter());
            Register(new Converters.GameObjectReferenceConverter());
            Register(new Converters.TransformConverter());
        }

        /// <summary>
        /// Clears all registered converters. Primarily for testing.
        /// </summary>
        internal void Clear()
        {
            _convertersByType.Clear();
            _convertersByTag.Clear();
        }

        /// <summary>
        /// Resets the singleton instance. Primarily for test isolation.
        /// </summary>
        internal static void ResetInstance()
        {
            _instance = null;
        }
    }
}
