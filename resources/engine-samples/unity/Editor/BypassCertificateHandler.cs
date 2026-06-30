using UnityEngine.Networking;

namespace GAP.Editor
{
    /// <summary>
    /// Bypasses SSL certificate validation for UnityWebRequest in the Editor.
    /// Unity's built-in TLS stack sometimes rejects valid AWS API Gateway certificates.
    /// Only used for editor-time admin operations — never included in player builds.
    /// </summary>
    internal class BypassCertificateHandler : CertificateHandler
    {
        protected override bool ValidateCertificate(byte[] certificateData) => true;
    }
}
