import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBarcode,
  faLock,
  faSpinner,
  faExclamationTriangle,
} from "@fortawesome/free-solid-svg-icons";
import { kioskRequest, isKioskUnlocked, unlockKiosk, lockKiosk } from "../../api/kiosk";
import BarcodeAttendanceKiosk from "../manager/BarcodeAttendanceKiosk";
import "./KioskGate.css";

/**
 * Public attendance kiosk entry point.
 *
 * Employees reach this page from the landing page "Attendance" button. The
 * scanner UI stays hidden until the shared kiosk PIN (configured by an admin
 * in Settings) is entered. The PIN is kept in sessionStorage and sent as the
 * X-Kiosk-Pin header on punch/log requests.
 */
const KioskGate = () => {
  const [unlocked, setUnlocked] = useState(isKioskUnlocked());
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");
    try {
      await kioskRequest("/kiosk/verify", {
        method: "POST",
        body: { pin: trimmed },
      });
      unlockKiosk(trimmed);
      setUnlocked(true);
    } catch (err) {
      setError(err?.message || "Invalid kiosk PIN.");
    } finally {
      setLoading(false);
    }
  };

  if (unlocked) {
    return (
      <>
        <BarcodeAttendanceKiosk />
        <button
          type="button"
          className="kiosk-lock-btn"
          title="Lock kiosk"
          onClick={() => { lockKiosk(); setUnlocked(false); setPin(""); }}
        >
          <FontAwesomeIcon icon={faLock} />
        </button>
      </>
    );
  }

  return (
    <div className="kiosk-gate">
      <form className="kiosk-gate-card" onSubmit={handleSubmit}>
        <div className="kiosk-gate-icon">
          <FontAwesomeIcon icon={faBarcode} />
        </div>
        <span className="kiosk-gate-eyebrow">Pawesome Retreat Inc.</span>
        <h1>Employee Attendance</h1>
        <p>Enter the kiosk access PIN provided by your manager to open the attendance scanner.</p>

        {error && (
          <div className="kiosk-gate-error" role="alert">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{error}</span>
          </div>
        )}

        <label className="kiosk-gate-field">
          <FontAwesomeIcon icon={faLock} />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Kiosk PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
        </label>

        <button type="submit" className="kiosk-gate-submit" disabled={loading || !pin.trim()}>
          {loading ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> Verifying…
            </>
          ) : (
            "Unlock Kiosk"
          )}
        </button>
      </form>
    </div>
  );
};

export default KioskGate;
