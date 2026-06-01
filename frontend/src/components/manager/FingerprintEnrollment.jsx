import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
  faFingerprint,
  faSpinner,
  faTrash,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./FingerprintEnrollment.css";

const base64UrlToBase64 = (str) => {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  return str.replace(/-/g, "+").replace(/_/g, "/") + padding;
};

const base64ToUint8Array = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const uint8ArrayToBase64Url = (buffer) => {
  const binary = Array.from(new Uint8Array(buffer))
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

const FingerprintEnrollment = ({ userId, userName, onClose, onEnrolled }) => {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await apiRequest(`/manager/biometric/credentials?user_id=${userId}`);
      setCredentials(res?.data || []);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    window.clearTimeout(window.fingerToastTimer);
    window.fingerToastTimer = window.setTimeout(() => setToast(null), 3000);
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    setError("");

    try {
      // 1. Get registration challenge
      const challengeRes = await apiRequest("/manager/biometric/challenge", {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });

      if (!challengeRes?.success) {
        throw new Error(challengeRes?.message || "Failed to get registration challenge.");
      }

      const challengeBytes = base64ToUint8Array(base64UrlToBase64(challengeRes.challenge));
      const userIdBytes = base64ToUint8Array(challengeRes.user.id);

      // 2. Call navigator.credentials.create()
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: challengeRes.rp,
          user: {
            id: userIdBytes,
            name: challengeRes.user.name,
            displayName: challengeRes.user.displayName,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },   // ES256
            { type: "public-key", alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform", // built-in fingerprint reader
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "none",
        },
      });

      if (!credential) {
        throw new Error("No biometric credential was created.");
      }

      const credentialId = uint8ArrayToBase64Url(credential.rawId);

      // 3. Save credential
      const saveRes = await apiRequest("/manager/biometric/register", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          credential_id: credentialId,
          type: "fingerprint",
          device_name: navigator.platform || "Unknown Device",
        }),
      });

      if (saveRes?.success) {
        showToast("Fingerprint enrolled successfully.", "success");
        fetchCredentials();
        onEnrolled?.();
      } else {
        throw new Error(saveRes?.message || "Failed to save credential.");
      }
    } catch (err) {
      console.error("Enrollment error:", err);
      if (err.name === "NotAllowedError") {
        setError("Enrollment cancelled or not recognized.");
      } else if (err.name === "NotSupportedError") {
        setError("Biometric enrollment is not supported on this device.");
      } else {
        setError(err.message || "Enrollment failed.");
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemove = async (credId) => {
    setRemovingId(credId);
    try {
      await apiRequest(`/manager/biometric/credentials/${credId}`, { method: "DELETE" });
      showToast("Credential removed.", "success");
      fetchCredentials();
    } catch {
      showToast("Failed to remove credential.", "error");
    } finally {
      setRemovingId(null);
    }
  };

  const isWebAuthnSupported = typeof window !== "undefined" && window.PublicKeyCredential;

  return (
    <div className="fpe-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="fpe-dialog">
        <div className="fpe-header">
          <div>
            <span className="fpe-eyebrow">Biometric Enrollment</span>
            <h2>Manage Fingerprints</h2>
          </div>
          <button type="button" className="fpe-close" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="fpe-body">
          <div className="fpe-user">
            <FontAwesomeIcon icon={faUser} />
            <strong>{userName}</strong>
          </div>

          {!isWebAuthnSupported && (
            <div className="fpe-alert warning">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span>WebAuthn is not supported on this browser. Please use Chrome, Edge, or Safari.</span>
            </div>
          )}

          {error && (
            <div className="fpe-alert error">
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            className="fpe-enroll-btn"
            onClick={handleEnroll}
            disabled={enrolling || !isWebAuthnSupported}
          >
            {enrolling ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                <span>Scanning finger...</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faFingerprint} />
                <span>Register New Fingerprint</span>
              </>
            )}
          </button>

          {credentials.length > 0 && (
            <div className="fpe-list">
              <h4>Registered Credentials ({credentials.length})</h4>
              {credentials.map((cred) => (
                <div key={cred.id} className="fpe-item">
                  <div className="fpe-item-info">
                    <FontAwesomeIcon icon={faFingerprint} />
                    <div>
                      <strong>{cred.type?.replace("_", " ") || "Fingerprint"}</strong>
                      <small>{cred.device_name || "Unknown device"}</small>
                      <small>Added {new Date(cred.created_at).toLocaleDateString()}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="fpe-remove"
                    onClick={() => handleRemove(cred.id)}
                    disabled={removingId === cred.id}
                  >
                    <FontAwesomeIcon icon={removingId === cred.id ? faSpinner : faTrash} spin={removingId === cred.id} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {credentials.length === 0 && !loading && (
            <div className="fpe-empty">
              <FontAwesomeIcon icon={faFingerprint} />
              <p>No fingerprints registered yet.</p>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className={`fpe-toast ${toast.type}`}>
          <FontAwesomeIcon icon={toast.type === "error" ? faExclamationTriangle : faCheckCircle} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default FingerprintEnrollment;
