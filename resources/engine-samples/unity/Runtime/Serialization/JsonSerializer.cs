using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace GAP.Serialization
{
    /// <summary>
    /// Shared JSON serialization helper that converts object graphs (including nested
    /// dictionaries and lists produced by the TypeSerializer) into JSON strings.
    /// Used by both GAPClient (HTTP payloads) and QueuePersister (WAL entries).
    /// </summary>
    public static class JsonSerializer
    {
        /// <summary>
        /// Appends the JSON representation of a value directly to a StringBuilder.
        /// Handles nulls, strings, booleans, numeric types, nested dictionaries, and lists.
        /// </summary>
        public static void AppendValue(StringBuilder sb, object value)
        {
            if (value == null)
            {
                sb.Append("null");
                return;
            }
            if (value is string s)
            {
                sb.Append('"');
                sb.Append(EscapeJson(s));
                sb.Append('"');
                return;
            }
            if (value is bool b)
            {
                sb.Append(b ? "true" : "false");
                return;
            }
            if (value is Dictionary<string, object> dict)
            {
                sb.Append("{");
                bool first = true;
                foreach (var kvp in dict)
                {
                    if (!first) sb.Append(",");
                    first = false;
                    sb.Append('"');
                    sb.Append(EscapeJson(kvp.Key));
                    sb.Append("\":");
                    AppendValue(sb, kvp.Value);
                }
                sb.Append("}");
                return;
            }
            if (value is IList list)
            {
                sb.Append("[");
                for (int i = 0; i < list.Count; i++)
                {
                    if (i > 0) sb.Append(",");
                    AppendValue(sb, list[i]);
                }
                sb.Append("]");
                return;
            }
            if (value is float f)
            {
                sb.Append(f.ToString(CultureInfo.InvariantCulture));
                return;
            }
            if (value is double d)
            {
                sb.Append(d.ToString(CultureInfo.InvariantCulture));
                return;
            }
            if (value is int intVal)
            {
                sb.Append(intVal);
                return;
            }
            if (value is long longVal)
            {
                sb.Append(longVal);
                return;
            }
            sb.Append(value.ToString());
        }

        /// <summary>
        /// Escapes a string for safe inclusion in JSON output.
        /// </summary>
        public static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"")
                    .Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t");
        }
    }
}
