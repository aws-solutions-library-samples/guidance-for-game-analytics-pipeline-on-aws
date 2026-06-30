using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using UnityEngine;
using GAP.Serialization;

namespace GAP
{
    /// <summary>
    /// Write-Ahead Log (WAL) based queue persister for crash-safe event persistence.
    /// Appends events to a binary WAL file before they are sent, enabling recovery
    /// of uncommitted events after a crash.
    ///
    /// WAL Entry Format:
    /// [4-byte length prefix (uint32 LE)] = payload size + 4 (CRC) + 1 (status)
    /// [N-byte UTF-8 JSON payload]
    /// [4-byte CRC32 checksum (uint32 LE)] of payload bytes
    /// [1-byte status] 0x00 = uncommitted, 0x01 = committed
    /// </summary>
    public class QueuePersister : IDisposable
    {
        private const byte StatusUncommitted = 0x00;
        private const byte StatusCommitted = 0x01;

        private readonly string _walFilePath;
        private readonly int _maxWriteQueueDepth;
        private readonly DeduplicationRegistry _dedupRegistry;
        private FileStream _walStream;
        private bool _disposed;

        // Background write thread fields
        private readonly ConcurrentQueue<byte[]> _writeQueue = new ConcurrentQueue<byte[]>();
        private readonly ManualResetEventSlim _writeSignal = new ManualResetEventSlim(false);
        private readonly ManualResetEventSlim _queueDrainedSignal = new ManualResetEventSlim(true);
        private readonly Thread _writeThread;
        private volatile bool _running;

        /// <summary>
        /// Creates a new QueuePersister.
        /// </summary>
        /// <param name="walDirectory">Directory where the WAL file will be stored.</param>
        /// <param name="maxWriteQueueDepth">Maximum depth of the write queue (for future async use).</param>
        /// <param name="dedupRegistry">Deduplication registry for checking duplicates during recovery.</param>
        public QueuePersister(string walDirectory, int maxWriteQueueDepth = 256, DeduplicationRegistry dedupRegistry = null)
        {
            _walFilePath = walDirectory + "/wal.bin";
            _maxWriteQueueDepth = maxWriteQueueDepth;
            _dedupRegistry = dedupRegistry;

            if (!Directory.Exists(walDirectory))
            {
                Directory.CreateDirectory(walDirectory);
            }

            _walStream = new FileStream(_walFilePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 4096, FileOptions.WriteThrough);
            _walStream.Seek(0, SeekOrigin.End);

            // Start background write thread
            _running = true;
            _writeThread = new Thread(BackgroundWriteLoop)
            {
                Name = "GAP_WAL_Writer",
                IsBackground = true
            };
            _writeThread.Start();
        }

        /// <summary>
        /// Appends an event to the WAL file. Serializes the event to JSON, computes CRC32,
        /// builds the complete WAL entry as a byte array, and enqueues it for async background writing.
        /// If the write queue exceeds maxWriteQueueDepth, oldest unwritten entries are dropped.
        /// </summary>
        /// <param name="eventData">The event data to persist.</param>
        public void Append(GAPClient.EventData eventData)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(QueuePersister));

            byte[] payload = Encoding.UTF8.GetBytes(SerializeEventData(eventData));
            uint crc = IntegrityVerifier.ComputeCRC32(payload);

            // Length prefix = payload length + 4 (CRC) + 1 (status)
            uint lengthPrefix = (uint)(payload.Length + 5);

            // Build the complete WAL entry as a single byte array
            byte[] entry = new byte[4 + payload.Length + 4 + 1];
            int offset = 0;

            // Write length prefix (4 bytes, little-endian)
            entry[offset++] = (byte)(lengthPrefix & 0xFF);
            entry[offset++] = (byte)((lengthPrefix >> 8) & 0xFF);
            entry[offset++] = (byte)((lengthPrefix >> 16) & 0xFF);
            entry[offset++] = (byte)((lengthPrefix >> 24) & 0xFF);

            // Write payload
            Buffer.BlockCopy(payload, 0, entry, offset, payload.Length);
            offset += payload.Length;

            // Write CRC32 (4 bytes, little-endian)
            entry[offset++] = (byte)(crc & 0xFF);
            entry[offset++] = (byte)((crc >> 8) & 0xFF);
            entry[offset++] = (byte)((crc >> 16) & 0xFF);
            entry[offset++] = (byte)((crc >> 24) & 0xFF);

            // Write status byte (uncommitted)
            entry[offset] = StatusUncommitted;

            // Enforce write queue depth limit — drop oldest entries if over capacity
            while (_writeQueue.Count >= _maxWriteQueueDepth)
            {
                if (_writeQueue.TryDequeue(out _))
                {
                    Debug.LogWarning("[GAP:WAL] Write queue exceeded max depth, dropping oldest unwritten entry");
                }
            }

            // Enqueue the entry for background writing
            _writeQueue.Enqueue(entry);
            _queueDrainedSignal.Reset();
            _writeSignal.Set();
        }

        /// <summary>
        /// Marks the specified events as committed in the WAL by overwriting their status byte in-place.
        /// IMPORTANT: Flush() must be called before this method to ensure all pending writes are on disk.
        /// This method accesses the WAL file synchronously and is not thread-safe with the background writer.
        /// </summary>
        /// <param name="eventIds">The event IDs to mark as committed.</param>
        public void MarkCommitted(IEnumerable<string> eventIds)
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(QueuePersister));

            var idsToCommit = new HashSet<string>(eventIds);
            if (idsToCommit.Count == 0)
                return;

            _walStream.Seek(0, SeekOrigin.Begin);
            long fileLength = _walStream.Length;

            while (_walStream.Position < fileLength)
            {
                long entryStart = _walStream.Position;

                // Read length prefix
                if (fileLength - _walStream.Position < 4)
                    break;

                uint lengthPrefix = ReadUInt32(_walStream);

                // Check if we have enough bytes for this entry
                if (fileLength - _walStream.Position < lengthPrefix)
                    break;

                int payloadLength = (int)(lengthPrefix - 5);
                if (payloadLength < 0)
                    break;

                // Read payload
                byte[] payload = new byte[payloadLength];
                _walStream.Read(payload, 0, payloadLength);

                // Skip CRC (4 bytes)
                _walStream.Seek(4, SeekOrigin.Current);

                // Position of status byte
                long statusPosition = _walStream.Position;

                // Read current status
                int status = _walStream.ReadByte();
                if (status == -1)
                    break;

                // Check if this entry's event_id is in the commit set
                if (status == StatusUncommitted)
                {
                    string json = Encoding.UTF8.GetString(payload);
                    string eventId = ExtractEventIdFromJson(json);

                    if (eventId != null && idsToCommit.Contains(eventId))
                    {
                        // Overwrite status byte to committed
                        _walStream.Seek(statusPosition, SeekOrigin.Begin);
                        _walStream.WriteByte(StatusCommitted);
                        _walStream.Flush();

                        idsToCommit.Remove(eventId);
                        if (idsToCommit.Count == 0)
                            break;

                        // Continue from after the status byte
                        _walStream.Seek(statusPosition + 1, SeekOrigin.Begin);
                    }
                }
            }
        }

        /// <summary>
        /// Reads the WAL sequentially and recovers all valid, uncommitted, non-duplicate events.
        /// Validates length prefixes and CRC32 checksums. Skips committed, corrupted, and
        /// deduplicated entries.
        /// IMPORTANT: Flush() must be called before this method to ensure all pending writes are on disk.
        /// This method accesses the WAL file synchronously and is not thread-safe with the background writer.
        /// </summary>
        /// <returns>List of recoverable EventData objects.</returns>
        public List<GAPClient.EventData> Recover()
        {
            if (_disposed)
                throw new ObjectDisposedException(nameof(QueuePersister));

            var recovered = new List<GAPClient.EventData>();
            int corruptedCount = 0;

            _walStream.Seek(0, SeekOrigin.Begin);
            long fileLength = _walStream.Length;

            while (_walStream.Position < fileLength)
            {
                long entryStart = _walStream.Position;

                // Need at least 4 bytes for length prefix
                if (fileLength - _walStream.Position < 4)
                {
                    long bytesLost = fileLength - _walStream.Position;
                    Debug.LogWarning($"[GAP:WAL] Partial write detected, {bytesLost} bytes lost");
                    break;
                }

                uint lengthPrefix = ReadUInt32(_walStream);

                // Validate length prefix: must be at least 5 (4 CRC + 1 status) and reasonable
                if (lengthPrefix < 5)
                {
                    corruptedCount++;
                    // Cannot determine entry boundary, stop processing
                    long bytesLost = fileLength - _walStream.Position;
                    Debug.LogWarning($"[GAP:WAL] Partial write detected, {bytesLost} bytes lost");
                    break;
                }

                // Check if we have enough bytes remaining for this entry
                if (fileLength - _walStream.Position < lengthPrefix)
                {
                    long bytesLost = fileLength - entryStart;
                    Debug.LogWarning($"[GAP:WAL] Partial write detected, {bytesLost} bytes lost");
                    break;
                }

                int payloadLength = (int)(lengthPrefix - 5);

                // Read payload
                byte[] payload = new byte[payloadLength];
                _walStream.Read(payload, 0, payloadLength);

                // Read CRC32
                uint storedCrc = ReadUInt32(_walStream);

                // Read status byte
                int status = _walStream.ReadByte();
                if (status == -1)
                {
                    long bytesLost = fileLength - entryStart;
                    Debug.LogWarning($"[GAP:WAL] Partial write detected, {bytesLost} bytes lost");
                    break;
                }

                // Skip committed entries
                if (status == StatusCommitted)
                    continue;

                // Validate CRC32
                if (!IntegrityVerifier.Validate(payload, storedCrc))
                {
                    corruptedCount++;
                    continue;
                }

                // Deserialize event
                string json = Encoding.UTF8.GetString(payload);
                GAPClient.EventData eventData = DeserializeEventData(json);

                if (eventData == null)
                {
                    corruptedCount++;
                    continue;
                }

                // Check deduplication registry
                if (_dedupRegistry != null && _dedupRegistry.Contains(eventData.event_id))
                {
                    Debug.Log($"[GAP:WAL] Skipping duplicate event: {eventData.event_id}");
                    continue;
                }

                recovered.Add(eventData);
            }

            if (corruptedCount > 0)
            {
                Debug.LogWarning($"[GAP:WAL] Recovery found {corruptedCount} corrupted entries");
            }

            // Compact the WAL to contain only recovered (uncommitted) entries
            Compact(recovered);

            return recovered;
        }

        /// <summary>
        /// Compacts the WAL by writing a new file containing only the recovered (uncommitted) entries,
        /// then atomically replacing the old WAL file. This removes committed and corrupted entries
        /// from the WAL, reducing file size and speeding up future recoveries.
        /// If recoveredEvents is empty, the WAL is truncated to an empty file.
        /// </summary>
        /// <param name="recoveredEvents">The list of uncommitted events recovered from the WAL.</param>
        private void Compact(List<GAPClient.EventData> recoveredEvents)
        {
            // Close the current WAL stream
            if (_walStream != null)
            {
                _walStream.Close();
                _walStream.Dispose();
                _walStream = null;
            }

            string tempFilePath = _walFilePath + ".tmp";

            try
            {
                // Create a temporary file with only the uncommitted entries
                using (var tempStream = new FileStream(tempFilePath, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
                {
                    foreach (var eventData in recoveredEvents)
                    {
                        byte[] payload = Encoding.UTF8.GetBytes(SerializeEventData(eventData));
                        uint crc = IntegrityVerifier.ComputeCRC32(payload);

                        // Length prefix = payload length + 4 (CRC) + 1 (status)
                        uint lengthPrefix = (uint)(payload.Length + 5);

                        // Write length prefix (4 bytes, little-endian)
                        WriteUInt32(tempStream, lengthPrefix);

                        // Write payload
                        tempStream.Write(payload, 0, payload.Length);

                        // Write CRC32 (4 bytes, little-endian)
                        WriteUInt32(tempStream, crc);

                        // Write status byte (uncommitted)
                        tempStream.WriteByte(StatusUncommitted);
                    }

                    tempStream.Flush();
                }

                // Atomically replace old WAL with compacted version
                // Delete old WAL file
                if (File.Exists(_walFilePath))
                {
                    File.Delete(_walFilePath);
                }

                // Rename temp file to WAL file
                File.Move(tempFilePath, _walFilePath);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[GAP:WAL] Compaction failed: {ex.Message}. Attempting cleanup.");

                // Clean up temp file if it exists
                try
                {
                    if (File.Exists(tempFilePath))
                    {
                        File.Delete(tempFilePath);
                    }
                }
                catch (Exception)
                {
                    // Best effort cleanup
                }
            }
            finally
            {
                // Reopen the WAL stream pointing to the (possibly new) file
                _walStream = new FileStream(_walFilePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 4096, FileOptions.WriteThrough);
                _walStream.Seek(0, SeekOrigin.End);
            }
        }

        /// <summary>
        /// Blocks until the background write queue is fully drained and all pending entries
        /// have been written to disk. Must be called before MarkCommitted or Recover to ensure
        /// thread safety with the background writer.
        /// </summary>
        public void Flush()
        {
            if (_disposed)
                return;

            // Signal the write thread to process any remaining items
            _writeSignal.Set();

            // Wait until the queue is fully drained
            _queueDrainedSignal.Wait();
        }

        /// <summary>
        /// Disposes the persister by signaling the background thread to stop, joining it,
        /// and closing the WAL file stream.
        /// </summary>
        public void Dispose()
        {
            if (_disposed)
                return;

            _disposed = true;

            // Signal the background thread to stop
            _running = false;
            _writeSignal.Set();

            // Wait for the background thread to finish
            if (_writeThread != null && _writeThread.IsAlive)
            {
                _writeThread.Join(TimeSpan.FromSeconds(5));
            }

            // Clean up synchronization primitives
            _writeSignal.Dispose();
            _queueDrainedSignal.Dispose();

            if (_walStream != null)
            {
                _walStream.Close();
                _walStream.Dispose();
                _walStream = null;
            }
        }

        #region Background Write Thread

        /// <summary>
        /// Background thread loop that dequeues all available WAL entries from the concurrent queue,
        /// writes them to the FileStream in a batch, and flushes once. This batches multiple pending
        /// writes into a single filesystem flush when events arrive faster than write throughput.
        /// </summary>
        private void BackgroundWriteLoop()
        {
            while (_running)
            {
                // Wait for signal that new entries are available
                _writeSignal.Wait();
                _writeSignal.Reset();

                if (!_running && _writeQueue.IsEmpty)
                    break;

                // Dequeue all available entries and write them in a batch
                DrainAndWriteQueue();
            }

            // Final drain on shutdown to write any remaining entries
            DrainAndWriteQueue();
        }

        /// <summary>
        /// Dequeues all available entries from the write queue and writes them to the WAL file
        /// in a single batch, flushing only once at the end for efficiency.
        /// </summary>
        private void DrainAndWriteQueue()
        {
            bool wroteAny = false;

            while (_writeQueue.TryDequeue(out byte[] entry))
            {
                if (_walStream == null)
                    break;

                _walStream.Seek(0, SeekOrigin.End);
                _walStream.Write(entry, 0, entry.Length);
                wroteAny = true;
            }

            // Single flush for the entire batch
            if (wroteAny && _walStream != null)
            {
                _walStream.Flush();
            }

            // Signal that the queue is drained
            if (_writeQueue.IsEmpty)
            {
                _queueDrainedSignal.Set();
            }
        }

        #endregion

        #region JSON Serialization Helpers

        /// <summary>
        /// Serializes an EventData object to JSON manually.
        /// Unity's JsonUtility doesn't handle Dictionary well, so we build JSON by hand.
        /// </summary>
        private string SerializeEventData(GAPClient.EventData eventData)
        {
            var sb = new StringBuilder();
            sb.Append("{");
            sb.Append($"\"event_id\":\"{Serialization.JsonSerializer.EscapeJson(eventData.event_id)}\"");
            sb.Append($",\"event_type\":\"{Serialization.JsonSerializer.EscapeJson(eventData.event_type)}\"");
            sb.Append($",\"event_name\":\"{Serialization.JsonSerializer.EscapeJson(eventData.event_name)}\"");
            sb.Append($",\"event_timestamp\":{eventData.event_timestamp}");

            if (!string.IsNullOrEmpty(eventData.event_version))
                sb.Append($",\"event_version\":\"{Serialization.JsonSerializer.EscapeJson(eventData.event_version)}\"");

            if (!string.IsNullOrEmpty(eventData.app_version))
                sb.Append($",\"app_version\":\"{Serialization.JsonSerializer.EscapeJson(eventData.app_version)}\"");

            if (eventData.event_data != null && eventData.event_data.Count > 0)
            {
                sb.Append(",\"event_data\":");
                Serialization.JsonSerializer.AppendValue(sb, eventData.event_data);
            }

            sb.Append("}");
            return sb.ToString();
        }

        /// <summary>
        /// Deserializes a JSON string back into an EventData object.
        /// </summary>
        private GAPClient.EventData DeserializeEventData(string json)
        {
            try
            {
                var fields = ParseJsonObject(json);
                if (fields == null)
                    return null;

                string eventId = GetStringField(fields, "event_id");
                string eventType = GetStringField(fields, "event_type");
                string eventName = GetStringField(fields, "event_name");
                string eventVersion = GetStringField(fields, "event_version");
                string appVersion = GetStringField(fields, "app_version");
                long eventTimestamp = GetLongField(fields, "event_timestamp");

                Dictionary<string, object> eventData = null;
                if (fields.ContainsKey("event_data"))
                {
                    eventData = ParseJsonObjectValues(fields["event_data"]);
                    // Reconstruct Unity types from tagged dictionaries
                    if (eventData != null)
                    {
                        eventData = TypeSerializer.DeserializeEventData(eventData);
                    }
                }

                var result = new GAPClient.EventData(eventType, eventName, appVersion, eventData);
                result.event_id = eventId;
                result.event_timestamp = eventTimestamp;
                result.event_version = eventVersion;
                return result;
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>
        /// Extracts the event_id field from a JSON string without full parsing.
        /// </summary>
        private string ExtractEventIdFromJson(string json)
        {
            const string key = "\"event_id\":\"";
            int startIndex = json.IndexOf(key, StringComparison.Ordinal);
            if (startIndex < 0)
                return null;

            startIndex += key.Length;
            int endIndex = json.IndexOf('"', startIndex);
            if (endIndex < 0)
                return null;

            return json.Substring(startIndex, endIndex - startIndex);
        }

        /// <summary>
        /// Parses a flat JSON object into a dictionary of field name to raw JSON value strings.
        /// </summary>
        private Dictionary<string, string> ParseJsonObject(string json)
        {
            var result = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(json))
                return null;

            json = json.Trim();
            if (json.Length < 2 || json[0] != '{' || json[json.Length - 1] != '}')
                return null;

            // Remove outer braces
            string content = json.Substring(1, json.Length - 2);
            int pos = 0;

            while (pos < content.Length)
            {
                // Skip whitespace
                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;

                if (pos >= content.Length)
                    break;

                // Expect opening quote for key
                if (content[pos] != '"')
                    break;

                // Read key
                string key = ReadJsonString(content, ref pos);
                if (key == null)
                    break;

                // Skip whitespace and colon
                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;
                if (pos >= content.Length || content[pos] != ':')
                    break;
                pos++; // skip colon

                // Skip whitespace
                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;

                // Read value
                string value = ReadJsonValue(content, ref pos);
                if (value == null)
                    break;

                result[key] = value;

                // Skip whitespace and comma
                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;
                if (pos < content.Length && content[pos] == ',')
                    pos++;
            }

            return result;
        }

        /// <summary>
        /// Parses a JSON object string into a Dictionary of string to object values.
        /// </summary>
        private Dictionary<string, object> ParseJsonObjectValues(string json)
        {
            var result = new Dictionary<string, object>();
            if (string.IsNullOrEmpty(json))
                return result;

            json = json.Trim();
            if (json.Length < 2 || json[0] != '{' || json[json.Length - 1] != '}')
                return result;

            string content = json.Substring(1, json.Length - 2);
            int pos = 0;

            while (pos < content.Length)
            {
                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;

                if (pos >= content.Length)
                    break;

                if (content[pos] != '"')
                    break;

                string key = ReadJsonString(content, ref pos);
                if (key == null)
                    break;

                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;
                if (pos >= content.Length || content[pos] != ':')
                    break;
                pos++;

                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;

                string rawValue = ReadJsonValue(content, ref pos);
                if (rawValue == null)
                    break;

                result[key] = ParseJsonPrimitive(rawValue);

                while (pos < content.Length && char.IsWhiteSpace(content[pos]))
                    pos++;
                if (pos < content.Length && content[pos] == ',')
                    pos++;
            }

            return result;
        }

        private object ParseJsonPrimitive(string raw)
        {
            if (string.IsNullOrEmpty(raw))
                return null;

            raw = raw.Trim();

            if (raw == "null")
                return null;
            if (raw == "true")
                return true;
            if (raw == "false")
                return false;

            // String value
            if (raw.Length >= 2 && raw[0] == '"' && raw[raw.Length - 1] == '"')
                return UnescapeJson(raw.Substring(1, raw.Length - 2));

            // Try numeric
            if (long.TryParse(raw, out long longVal))
                return longVal;
            if (double.TryParse(raw, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out double doubleVal))
                return doubleVal;

            return raw;
        }

        private string ReadJsonString(string content, ref int pos)
        {
            if (pos >= content.Length || content[pos] != '"')
                return null;

            pos++; // skip opening quote
            var sb = new StringBuilder();

            while (pos < content.Length)
            {
                char c = content[pos];
                if (c == '\\')
                {
                    pos++;
                    if (pos >= content.Length)
                        return null;
                    char escaped = content[pos];
                    switch (escaped)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        default: sb.Append(escaped); break;
                    }
                }
                else if (c == '"')
                {
                    pos++; // skip closing quote
                    return sb.ToString();
                }
                else
                {
                    sb.Append(c);
                }
                pos++;
            }

            return null; // unterminated string
        }

        private string ReadJsonValue(string content, ref int pos)
        {
            if (pos >= content.Length)
                return null;

            char c = content[pos];

            // String value
            if (c == '"')
            {
                int start = pos;
                pos++; // skip opening quote
                while (pos < content.Length)
                {
                    if (content[pos] == '\\')
                    {
                        pos += 2;
                        continue;
                    }
                    if (content[pos] == '"')
                    {
                        pos++;
                        return content.Substring(start, pos - start);
                    }
                    pos++;
                }
                return null;
            }

            // Object or array
            if (c == '{' || c == '[')
            {
                char open = c;
                char close = c == '{' ? '}' : ']';
                int depth = 1;
                int start = pos;
                pos++;

                while (pos < content.Length && depth > 0)
                {
                    if (content[pos] == '"')
                    {
                        pos++;
                        while (pos < content.Length)
                        {
                            if (content[pos] == '\\') { pos += 2; continue; }
                            if (content[pos] == '"') { pos++; break; }
                            pos++;
                        }
                        continue;
                    }
                    if (content[pos] == open) depth++;
                    else if (content[pos] == close) depth--;
                    pos++;
                }

                return content.Substring(start, pos - start);
            }

            // Number, boolean, null
            {
                int start = pos;
                while (pos < content.Length && content[pos] != ',' && content[pos] != '}' &&
                       content[pos] != ']' && !char.IsWhiteSpace(content[pos]))
                {
                    pos++;
                }
                return content.Substring(start, pos - start);
            }
        }

        private string GetStringField(Dictionary<string, string> fields, string key)
        {
            if (!fields.ContainsKey(key))
                return null;

            string raw = fields[key].Trim();
            if (raw.Length >= 2 && raw[0] == '"' && raw[raw.Length - 1] == '"')
                return UnescapeJson(raw.Substring(1, raw.Length - 2));

            return null;
        }

        private long GetLongField(Dictionary<string, string> fields, string key)
        {
            if (!fields.ContainsKey(key))
                return 0;

            string raw = fields[key].Trim();
            if (long.TryParse(raw, out long val))
                return val;
            return 0;
        }

        private static string UnescapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return s.Replace("\\\"", "\"").Replace("\\\\", "\\")
                    .Replace("\\n", "\n").Replace("\\r", "\r").Replace("\\t", "\t");
        }

        #endregion

        #region Binary I/O Helpers

        private static void WriteUInt32(Stream stream, uint value)
        {
            stream.WriteByte((byte)(value & 0xFF));
            stream.WriteByte((byte)((value >> 8) & 0xFF));
            stream.WriteByte((byte)((value >> 16) & 0xFF));
            stream.WriteByte((byte)((value >> 24) & 0xFF));
        }

        private static uint ReadUInt32(Stream stream)
        {
            int b0 = stream.ReadByte();
            int b1 = stream.ReadByte();
            int b2 = stream.ReadByte();
            int b3 = stream.ReadByte();

            if (b0 == -1 || b1 == -1 || b2 == -1 || b3 == -1)
                throw new EndOfStreamException();

            return (uint)(b0 | (b1 << 8) | (b2 << 16) | (b3 << 24));
        }

        #endregion
    }
}
