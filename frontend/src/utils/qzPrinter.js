/**
 * QZ Tray printing utility.
 *
 * Attempts silent/direct printing via the local QZ Tray service.
 * If QZ Tray is not installed or not running, returns false so the
 * caller can fall back to the browser print dialog.
 *
 * Two print paths:
 *   - printRawViaQZ(data)  — ESC/POS raw commands; printer renders with
 *                            its own built-in fonts (preferred for
 *                            thermal receipt printers).
 *   - printViaQZ(html)     — HTML→pixel rasterization (retained as a
 *                            documented fallback; unreliable on some
 *                            generic POS-58 clones).
 *
 * QZ Tray must be running in the system tray for this to work.
 * Download from: https://qz.io/download/
 *
 * Security note:
 *   Using unsigned (demo) mode — QZ Tray will show a one-time
 *   "Allow unsigned requests?" dialog per browser origin.
 *   Click "Always allow" to suppress it permanently.
 */

let _qz = null;
let _loadAttempted = false;

/** Lazy-load qz-tray and cache the reference. */
async function loadQZ() {
  if (_qz) return _qz;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  try {
    const mod = await import("qz-tray");
    _qz = mod.default ?? mod;
    return _qz;
  } catch {
    return null;
  }
}

/**
 * Load qz-tray, configure unsigned/demo mode, and open the websocket.
 * Returns the qz module on success, null if unavailable.
 */
async function connect() {
  const qz = await loadQZ();
  if (!qz) return null;

  // ── Demo / unsigned mode ──────────────────────────────────
  // Suppress certificate requirements (QZ Tray will ask once for permission)
  qz.security.setCertificatePromise((resolve) => resolve(""));
  qz.security.setSignaturePromise((_toSign) => (resolve) => resolve(""));

  // ── Connect (fail fast if QZ Tray is not running) ─────────
  if (!qz.websocket.isActive()) {
    const connectPromise = qz.websocket.connect({ retries: 0 });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("QZ Tray connection timeout")), 3000)
    );
    await Promise.race([connectPromise, timeoutPromise]);
  }
  return qz;
}

/** Fire-and-forget disconnect — never throws. */
function disconnect(qz) {
  try {
    if (qz.websocket.isActive()) qz.websocket.disconnect().catch(() => {});
  } catch {}
}

/**
 * Print raw ESC/POS command data via QZ Tray.
 *
 * The printer interprets the bytes natively — built-in fonts, exact
 * alignment, no rasterization. This is the preferred path for thermal
 * receipt printers.
 *
 * @param {string} rawData - ESC/POS command string (pure ASCII + control bytes)
 * @returns {Promise<boolean>} true  = printed silently via QZ Tray
 *                             false = QZ Tray unavailable; caller should fall back
 */
export async function printRawViaQZ(rawData) {
  let qz;
  try {
    qz = await connect();
  } catch {
    return false;
  }
  if (!qz) return false;

  try {
    const printer = await qz.printers.getDefault();
    // Raw jobs need no size/margins — printer firmware controls the paper.
    const config = qz.configs.create(printer, { copies: 1 });

    await qz.print(config, [
      { type: "raw", format: "plain", data: rawData },
    ]);

    disconnect(qz);
    return true;
  } catch (err) {
    console.warn("[QZ Tray] Raw print failed:", err?.message ?? err);
    disconnect(qz);
    return false;
  }
}

/**
 * Try to print HTML content via QZ Tray (pixel rasterization).
 *
 * Retained as a documented fallback — HTML rasterization depends on the
 * embedded browser engine, installed fonts, and driver page size, which
 * makes it unreliable on some generic 58mm thermal printers.
 *
 * @param {string} htmlContent - Full self-contained HTML document string.
 * @returns {Promise<boolean>} true  = printed silently via QZ Tray
 *                             false = QZ Tray unavailable; caller should fall back
 */
export async function printViaQZ(htmlContent) {
  let qz;
  try {
    qz = await connect();
  } catch {
    return false;
  }
  if (!qz) return false;

  try {
    const printer = await qz.printers.getDefault();

    // 58 mm receipt paper — printable width ~48 mm ≈ 1.89 in
    const config = qz.configs.create(printer, {
      size:          { width: 1.5, height: null },
      units:         "in",
      margins:       { top: 0, right: 0, bottom: 0, left: 0 },
      interpolation: "nearest-neighbor",
      copies:        1,
    });

    await qz.print(config, [
      {
        type:   "pixel",
        format: "html",
        flavor: "plain",
        data:   htmlContent,
      },
    ]);

    disconnect(qz);
    return true;
  } catch (err) {
    console.warn("[QZ Tray] Print failed or not running:", err?.message ?? err);
    disconnect(qz);
    return false;
  }
}

/**
 * Check whether the qz-tray module loaded (does not check if the
 * QZ Tray app is currently running — that requires a connection attempt).
 */
export async function isQZAvailable() {
  const qz = await loadQZ();
  return !!qz;
}
