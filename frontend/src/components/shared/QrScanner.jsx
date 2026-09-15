import React, { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import "./QrScanner.css";

// NOTE: Browser camera access requires HTTPS in production.
// The only exception is localhost / 127.0.0.1 (always allowed by browsers).
// Ensure your production deployment (Render) is served over HTTPS.

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

let instanceCounter = 0;

/**
 * Reusable webcam QR / barcode scanner component.
 *
 * Props:
 *  - onScan(code: string)  — called with the decoded text on success
 *  - stopOnScan?: boolean  — stop camera after the first successful scan (default: true)
 *  - className?: string
 */
const QrScanner = ({ onScan, stopOnScan = true, className = "" }) => {
  // Stable per-instance element ID so multiple scanners can coexist
  const elementId = useRef(`qr-scanner-${++instanceCounter}`).current;

  const html5Ref    = useRef(null);   // Html5Qrcode instance
  const scanningRef = useRef(false);  // whether camera is actually running

  const [cameras, setCameras]               = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [scanning, setScanning]             = useState(false);
  const [error, setError]                   = useState("");

  // Warn when page is served over plain HTTP in a non-localhost context
  const showHttpsWarning =
    typeof window !== "undefined" &&
    window.location.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(window.location.hostname);

  // ── Enumerate cameras on first render ──────────────────────────────────
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!devices || devices.length === 0) {
          setError("No camera found on this device.");
          return;
        }
        setCameras(devices);
        // Prefer rear / environment camera (mobile)
        const rear = devices.find((d) =>
          /back|rear|environment/i.test(d.label ?? "")
        );
        setSelectedCamera((rear ?? devices[0]).id);
      })
      .catch((err) => {
        const msg = String(err?.message ?? err ?? "");
        if (/permission|notallowed/i.test(msg) || err?.name === "NotAllowedError") {
          setError("Camera permission denied — please allow camera access and reload.");
        } else {
          setError("Could not list cameras: " + (err?.message || String(err)));
        }
      });
  }, []);

  // ── Stop helper (also called from cleanup) ─────────────────────────────
  const stopScanning = useCallback(async () => {
    if (!scanningRef.current || !html5Ref.current) return;
    scanningRef.current = false;
    setScanning(false);
    try {
      await html5Ref.current.stop();
      html5Ref.current.clear();
    } catch {
      // Ignore — scanner may already be stopped
    }
    html5Ref.current = null;
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (scanningRef.current && html5Ref.current) {
        scanningRef.current = false;
        html5Ref.current
          .stop()
          .catch(() => {})
          .finally(() => {
            try { html5Ref.current?.clear(); } catch { /* noop */ }
            html5Ref.current = null;
          });
      }
    };
  }, []);

  // ── Start scanning ─────────────────────────────────────────────────────
  const startScanning = useCallback(async () => {
    if (!selectedCamera || scanningRef.current) return;
    setError("");

    const instance = new Html5Qrcode(elementId, {
      formatsToSupport: FORMATS,
      verbose: false,
    });
    html5Ref.current = instance;

    try {
      await instance.start(
        selectedCamera,
        {
          fps: 15,
          // Wide short box for 1D barcodes (CODE_128, EAN_13, etc.);
          // still large enough to catch QR codes.
          // Using a function keeps it proportional to the viewfinder size.
          qrbox: (vw, vh) => ({
            width: Math.min(Math.floor(vw * 0.85), 400),
            height: Math.min(Math.floor(vh * 0.35), 120),
          }),
          aspectRatio: 1.7777778, // request 16:9 for sharper camera feed
        },
        (decodedText) => {
          // Success callback — fires repeatedly while code is in frame
          if (stopOnScan) {
            // Stop first, then notify parent
            stopScanning().then(() => onScan(decodedText));
          } else {
            onScan(decodedText);
          }
        },
        () => {
          // Error callback fires on every frame that has no code — safe to ignore
        }
      );
      scanningRef.current = true;
      setScanning(true);
    } catch (err) {
      html5Ref.current = null;
      const msg = String(err?.message ?? err ?? "");
      if (/permission|notallowed/i.test(msg) || err?.name === "NotAllowedError") {
        setError("Camera permission denied — please allow camera access and reload.");
      } else {
        setError("Failed to start camera: " + (err?.message || String(err)));
      }
    }
  }, [selectedCamera, stopOnScan, onScan, elementId, stopScanning]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={`qr-scanner ${className}`}>

      {showHttpsWarning && (
        <div className="qrs-warning" role="alert">
          Camera requires HTTPS in production. Use <code>localhost</code> for development.
        </div>
      )}

      {cameras.length > 1 && (
        <div className="qrs-camera-row">
          <label className="qrs-camera-label" htmlFor={`${elementId}-select`}>
            Camera
          </label>
          <select
            id={`${elementId}-select`}
            className="qrs-camera-select"
            value={selectedCamera ?? ""}
            onChange={(e) => setSelectedCamera(e.target.value)}
            disabled={scanning}
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || `Camera (${c.id.slice(0, 8)}…)`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* The library renders the video + viewfinder into this div */}
      <div id={elementId} className="qrs-viewfinder" />

      {error && (
        <div className="qrs-error" role="alert">
          {error}
        </div>
      )}

      <div className="qrs-controls">
        {!scanning ? (
          <button
            type="button"
            className="qrs-btn qrs-btn--start"
            onClick={startScanning}
            disabled={!selectedCamera || !!error}
          >
            <span className="qrs-btn-icon">📷</span>
            Start Scanning
          </button>
        ) : (
          <button
            type="button"
            className="qrs-btn qrs-btn--stop"
            onClick={stopScanning}
          >
            <span className="qrs-btn-icon">⏹</span>
            Stop Camera
          </button>
        )}
      </div>

      {scanning && (
        <p className="qrs-hint">
          Hold the barcode horizontally inside the scanning bar
        </p>
      )}
    </div>
  );
};

export default QrScanner;
