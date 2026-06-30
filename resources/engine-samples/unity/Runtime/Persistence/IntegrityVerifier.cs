using System;

namespace GAP
{
    /// <summary>
    /// Static utility class for CRC32 integrity verification of persisted data.
    /// Uses the standard CRC32 algorithm with polynomial 0xEDB88320 (reflected).
    /// </summary>
    public static class IntegrityVerifier
    {
        private static readonly uint[] CrcTable = GenerateCrcTable();

        /// <summary>
        /// Generates the CRC32 lookup table using polynomial 0xEDB88320.
        /// </summary>
        private static uint[] GenerateCrcTable()
        {
            var table = new uint[256];
            const uint polynomial = 0xEDB88320;

            for (uint i = 0; i < 256; i++)
            {
                uint crc = i;
                for (int j = 0; j < 8; j++)
                {
                    if ((crc & 1) != 0)
                        crc = (crc >> 1) ^ polynomial;
                    else
                        crc >>= 1;
                }
                table[i] = crc;
            }

            return table;
        }

        /// <summary>
        /// Computes the CRC32 checksum for the given byte array.
        /// </summary>
        /// <param name="data">The data to compute the checksum for.</param>
        /// <returns>The CRC32 checksum value.</returns>
        /// <exception cref="ArgumentNullException">Thrown when data is null.</exception>
        public static uint ComputeCRC32(byte[] data)
        {
            if (data == null)
                throw new ArgumentNullException(nameof(data));

            uint crc = 0xFFFFFFFF;

            for (int i = 0; i < data.Length; i++)
            {
                byte index = (byte)((crc ^ data[i]) & 0xFF);
                crc = (crc >> 8) ^ CrcTable[index];
            }

            return crc ^ 0xFFFFFFFF;
        }

        /// <summary>
        /// Validates that the given data matches the expected CRC32 checksum.
        /// Recomputes the checksum and compares it to the expected value.
        /// </summary>
        /// <param name="data">The data to validate.</param>
        /// <param name="expectedChecksum">The expected CRC32 checksum.</param>
        /// <returns>True if the recomputed checksum matches the expected value; false otherwise.</returns>
        /// <exception cref="ArgumentNullException">Thrown when data is null.</exception>
        public static bool Validate(byte[] data, uint expectedChecksum)
        {
            if (data == null)
                throw new ArgumentNullException(nameof(data));

            uint computedChecksum = ComputeCRC32(data);
            return computedChecksum == expectedChecksum;
        }
    }
}
