import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faClock,
  faExclamationTriangle,
  faFingerprint,
  faSignIn,
  faSignOut,
  faSpinner,
  faUserCheck,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import "./FingerprintKiosk.css";

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

const FingerprintKiosk = () => {
  const [punchType, setPunchType] = useState("check_in");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [summary, setSummary] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await apiRequest("/manager/biometric/today-summary");
      setSummary(res?.summary || null);
      setRecent(res?.recent || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const timer = setInterval(fetchSummary, 15000);
    return () => clearInterval(timer);
  }, [fetchSummary]);

  const handlePunch = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // 1. Get challenge
      const challengeRes = await apiRequest("/manager/biometric/auth-challenge", { method: "POST" });
      if (!challengeRes?.success) throw new Error("Failed to get authentication challenge.");

      const challengeBytes = base64ToUint8Array(base64UrlToBase64(challengeRes.challenge));
      const allowCredentials = (challengeRes.allowCredentials || []).map((cred) => ({
        id: base64ToUint8Array(base64UrlToBase64(cred.id)),
        type: "public-key",
      }));

      // 2. Call WebAuthn get()
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes,
          allowCredentials,
          timeout: 60000,
          userVerification: "required",
          rpId: challengeRes.rpId || window.location.hostname,
        },
      });

      if (!credential) {
        throw new Error("No biometric credential detected.");
      }

      const credentialId = uint8ArrayToBase64Url(credential.rawId);

      // 3. Verify and punch
      const punchRes = await apiRequest("/manager/biometric/verify-punch", {
        method: "POST",
        body: JSON.stringify({
          credential_id: credentialId,
          type: punchType,
        }),
      });

      if (punchRes?.success) {
        setResult({
          type: "success",
          message: punchRes.message,
          employee: punchRes.data?.employee_name,
          time: punchRes.data?.time,
          status: punchRes.data?.status,
        });
        fetchSummary();
      } else {
        throw new Error(punchRes?.message || "Verification failed.");
      }
    } catch (err) {
      console.error("Fingerprint punch error:", err);
      if (err.name === "NotAllowedError") {
        setError("Fingerprint scan cancelled or not recognized.");
      } else if (err.name === "NotSupportedError") {
        setError("Biometric authentication is not supported on this device.");
      } else {
        setError(err.message || "Failed to record attendance.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isWebAuthnSupported = typeof window !== "undefined" && window.PublicKeyCredential;

  return (
    <div className="fingerprint-kiosk">
      <section className="kiosk-hero">
        <div>
          <span className="kiosk-eyebrow">Biometric Attendance</span>
          <h1><FontAwesomeIcon icon={faFingerprint} /> Fingerprint Kiosk</h1>
          <p>Place your finger on the reader to check in or check out.</p>
        </div>
      </section>

      {!isWebAuthnSupported && (
        <div className="kiosk-alert warning">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>Biometric authentication is not supported on this browser. Please use Chrome, Edge, or Safari with a fingerprint-capable device.</span>
        </div>
      )}

      {error && (
        <div className="kiosk-alert error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className={`kiosk-alert ${result.type}`}>
          <FontAwesomeIcon icon={faCheckCircle} />
          <div>
            <strong>{result.message}</strong>
            <span>{result.employee} — {result.time}</span>
          </div>
        </div>
      )}

      <section className="kiosk-main">
        <div className="kiosk-type-toggle">
          <button
            type="button"
            className={punchType === "check_in" ? "active" : ""}
            onClick={() => { setPunchType("check_in"); setError(""); setResult(null); }}
          >
            <FontAwesomeIcon icon={faSignIn} /> Check In
          </button>
          <button
            type="button"
            className={punchType === "check_out" ? "active" : ""}
            onClick={() => { setPunchType("check_out"); setError(""); setResult(null); }}
          >
            <FontAwesomeIcon icon={faSignOut} /> Check Out
          </button>
        </div>

        <button
          type="button"
          className={`kiosk-scan-btn ${punchType}`}
          onClick={handlePunch}
          disabled={loading || !isWebAuthnSupported}
        >
          {loading ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>Scanning...</span>
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faFingerprint} />
              <span>Tap to {punchType === "check_in" ? "Check In" : "Check Out"}</span>
            </>
          )}
        </button>
      </section>

      {summary && (
        <section className="kiosk-summary">
          <div className="kiosk-stat">
            <FontAwesomeIcon icon={faUsers} />
            <strong>{summary.total_bio_records}</strong>
            <small>Biometric Records</small>
          </div>
          <div className="kiosk-stat">
            <FontAwesomeIcon icon={faSignIn} />
            <strong>{summary.checked_in}</strong>
            <small>Checked In</small>
          </div>
          <div className="kiosk-stat">
            <FontAwesomeIcon icon={faSignOut} />
            <strong>{summary.checked_out}</strong>
            <small>Checked Out</small>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="kiosk-recent">
          <h3><FontAwesomeIcon icon={faClock} /> Recent Activity</h3>
          <div className="kiosk-recent-list">
            {recent.map((r, i) => (
              <div key={i} className="kiosk-recent-item">
                <div className="kiosk-recent-info">
                  <strong>{r.employee_name}</strong>
                  <small>{r.role} · {r.source?.replace("_", " ")}</small>
                </div>
                <div className="kiosk-recent-times">
                  <span className="tag in">{r.check_in || "—"}</span>
                  <span className="tag out">{r.check_out || "—"}</span>
                </div>
                <span className={`kiosk-status ${r.status}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default FingerprintKiosk;
