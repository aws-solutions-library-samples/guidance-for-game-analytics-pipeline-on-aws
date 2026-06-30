using System;
using System.Collections.Generic;
using System.IO;

namespace GAP
{
    /// <summary>
    /// Tracks sent event IDs to prevent duplicate delivery after crash recovery.
    /// Uses a LinkedList for O(1) eviction of oldest entries and a HashSet for O(1) lookup.
    /// Persists state to a newline-delimited text file.
    /// </summary>
    public class DeduplicationRegistry : IDisposable
    {
        private readonly string _filePath;
        private readonly int _maxEntries;
        private readonly LinkedList<string> _order;
        private readonly HashSet<string> _lookup;

        /// <summary>
        /// Creates a new DeduplicationRegistry.
        /// </summary>
        /// <param name="filePath">Path to the file where event IDs are persisted.</param>
        /// <param name="maxEntries">Maximum number of event IDs to retain. Oldest are evicted when exceeded.</param>
        public DeduplicationRegistry(string filePath, int maxEntries = 10000)
        {
            _filePath = filePath;
            _maxEntries = maxEntries;
            _order = new LinkedList<string>();
            _lookup = new HashSet<string>();
        }

        /// <summary>
        /// Registers an event ID. If the registry is at capacity, the oldest entry is evicted.
        /// </summary>
        /// <param name="eventId">The event ID to register.</param>
        public void Register(string eventId)
        {
            if (_lookup.Contains(eventId))
                return;

            if (_order.Count >= _maxEntries)
            {
                var oldest = _order.First.Value;
                _order.RemoveFirst();
                _lookup.Remove(oldest);
            }

            _order.AddLast(eventId);
            _lookup.Add(eventId);
        }

        /// <summary>
        /// Checks whether an event ID has been registered.
        /// </summary>
        /// <param name="eventId">The event ID to check.</param>
        /// <returns>True if the event ID is in the registry; otherwise false.</returns>
        public bool Contains(string eventId)
        {
            return _lookup.Contains(eventId);
        }

        /// <summary>
        /// Persists all registered event IDs to disk as a newline-delimited text file.
        /// </summary>
        public void Persist()
        {
            var directory = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            using (var writer = new StreamWriter(_filePath, false, System.Text.Encoding.UTF8))
            {
                foreach (var id in _order)
                {
                    writer.WriteLine(id);
                }
            }
        }

        /// <summary>
        /// Loads event IDs from the persisted file into memory.
        /// Respects maxEntries by only keeping the most recent entries if the file contains more.
        /// </summary>
        public void Load()
        {
            _order.Clear();
            _lookup.Clear();

            if (!File.Exists(_filePath))
                return;

            var lines = File.ReadAllLines(_filePath);

            // If the file has more entries than maxEntries, only load the most recent ones
            int startIndex = lines.Length > _maxEntries ? lines.Length - _maxEntries : 0;

            for (int i = startIndex; i < lines.Length; i++)
            {
                var line = lines[i];
                if (string.IsNullOrEmpty(line))
                    continue;

                if (!_lookup.Contains(line))
                {
                    _order.AddLast(line);
                    _lookup.Add(line);
                }
            }
        }

        /// <summary>
        /// Disposes the registry by persisting current state to disk.
        /// </summary>
        public void Dispose()
        {
            Persist();
        }
    }
}
