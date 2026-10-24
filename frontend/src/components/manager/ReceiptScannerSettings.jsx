import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faPlus,
  faTrash,
  faRotate,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { showSuccess, showError } from "../../utils/alert.jsx";
import "./ReceiptScannerSettings.css";

const PROVIDER_LABEL = { gcash: "GCash", maya: "Maya" };

const emptyAccount = () => ({
  provider: "gcash",
  account_name: "",
  account_last4: "",
  active: true,
  _new: true,
});

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const joinCsv = (arr) => (Array.isArray(arr) ? arr.join(", ") : "");

const ReceiptScannerSettings = () => {
  const [settings, setSettings] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, metricsData] = await Promise.all([
        apiRequest("/manager/receipt-scanner/settings"),
        apiRequest("/manager/receipt-scanner/metrics"),
      ]);
      setSettings(settingsData);
      setMetrics(metricsData);
      setProviders(settingsData.providers || []);
      setAccounts((settingsData.clinic_accounts || []).filter((a) => a.active !== false));
    } catch (err) {
      showError(err.message || "Failed to load receipt scanner settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateProvider = (index, patch) =>
    setProviders((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const updateAccount = (index, patch) =>
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  const removeAccount = (index) =>
    setAccounts((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        providers: providers.map((p) => ({
          provider: p.provider,
          reference_pattern: p.reference_pattern || null,
          min_length: p.min_length || null,
          max_length: p.max_length || null,
          reference_labels: parseCsv(joinCsv(p.reference_labels)),
          accepted_status_texts: parseCsv(joinCsv(p.accepted_status_texts)),
          confusion_map: p.confusion_map || null,
          active: p.active !== false,
        })),
        clinic_accounts: accounts.map((a) => ({
          id: a.id || undefined,
          provider: a.provider,
          account_name: a.account_name,
          account_last4: a.account_last4 || null,
          active: a.active !== false,
        })),
      };
      const updated = await apiRequest("/manager/receipt-scanner/settings", "PUT", payload);
      setSettings(updated);
      setProviders(updated.providers || []);
      setAccounts((updated.clinic_accounts || []).filter((a) => a.active !== false));
      showSuccess("Receipt scanner settings saved.");
    } catch (err) {
      showError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rss-loading">
        <FontAwesomeIcon icon={faSpinner} spin size="2x" />
        <p>Loading receipt scanner settings…</p>
      </div>
    );
  }

  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <div className="rss-page">
      <div className="rss-header">
        <h2>Receipt Scanner</h2>
        <p>GCash / Maya receipt reading — provider patterns, clinic accounts, and accuracy.</p>
        {settings && (
          <p className="rss-meta">
            Scanner {settings.enabled ? "enabled" : "disabled"} · Reader chain: {(settings.chain || []).join(" → ")}
            {" "}· Auto-fill threshold {settings.thresholds?.auto_fill} · Review threshold {settings.thresholds?.review}
          </p>
        )}
      </div>

      {/* ── Metrics ── */}
      {metrics && (
        <section className="rss-section">
          <h3>Accuracy &amp; Review</h3>
          <div className="rss-metric-cards">
            <div className="rss-metric"><span className="rss-metric-value">{metrics.total_receipts}</span><span className="rss-metric-label">Receipts scanned</span></div>
            <div className="rss-metric"><span className="rss-metric-value">{pct(metrics.auto_fill_rate)}</span><span className="rss-metric-label">Auto-fill rate</span></div>
            <div className="rss-metric"><span className="rss-metric-value">{pct(metrics.correction_rate)}</span><span className="rss-metric-label">Correction rate</span></div>
            <div className="rss-metric"><span className="rss-metric-value">{pct(metrics.flagged_rate)}</span><span className="rss-metric-label">Flagged rate</span></div>
          </div>
          {(metrics.per_reader || []).length > 0 && (
            <table className="rss-table">
              <thead>
                <tr><th>Reader</th><th>Reads</th><th>With reference</th><th>Auto-fill</th><th>Avg latency</th></tr>
              </thead>
              <tbody>
                {metrics.per_reader.map((r) => (
                  <tr key={r.reader}>
                    <td>{r.reader === "ocr" ? "Local OCR" : "AI vision"}</td>
                    <td>{r.reads}</td>
                    <td>{r.with_reference}</td>
                    <td>{pct(r.auto_fill_rate)}</td>
                    <td>{r.avg_latency_ms == null ? "—" : `${r.avg_latency_ms} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ── Provider patterns ── */}
      <section className="rss-section">
        <h3>Provider Patterns</h3>
        <p className="rss-hint">Reference regexes and field labels the readers look for. Labels accept comma-separated values.</p>
        {providers.map((p, i) => (
          <div key={p.provider} className="rss-provider">
            <div className="rss-provider-head">
              <strong>{PROVIDER_LABEL[p.provider] || p.provider}</strong>
              <label className="rss-active-toggle">
                <input
                  type="checkbox"
                  checked={p.active !== false}
                  onChange={(e) => updateProvider(i, { active: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="rss-grid">
              <label className="rss-field">
                <span>Reference regex</span>
                <input
                  type="text"
                  value={p.reference_pattern || ""}
                  onChange={(e) => updateProvider(i, { reference_pattern: e.target.value })}
                  className="rss-input"
                />
              </label>
              <label className="rss-field rss-field--sm">
                <span>Min length</span>
                <input
                  type="number"
                  min="1"
                  value={p.min_length ?? ""}
                  onChange={(e) => updateProvider(i, { min_length: e.target.value ? Number(e.target.value) : null })}
                  className="rss-input"
                />
              </label>
              <label className="rss-field rss-field--sm">
                <span>Max length</span>
                <input
                  type="number"
                  min="1"
                  value={p.max_length ?? ""}
                  onChange={(e) => updateProvider(i, { max_length: e.target.value ? Number(e.target.value) : null })}
                  className="rss-input"
                />
              </label>
              <label className="rss-field">
                <span>Reference labels (CSV)</span>
                <input
                  type="text"
                  value={joinCsv(p.reference_labels)}
                  onChange={(e) => updateProvider(i, { reference_labels: parseCsv(e.target.value) })}
                  className="rss-input"
                  placeholder="Ref No., Reference ID"
                />
              </label>
              <label className="rss-field">
                <span>Accepted status texts (CSV)</span>
                <input
                  type="text"
                  value={joinCsv(p.accepted_status_texts)}
                  onChange={(e) => updateProvider(i, { accepted_status_texts: parseCsv(e.target.value) })}
                  className="rss-input"
                  placeholder="Success, Completed, Paid"
                />
              </label>
            </div>
          </div>
        ))}
      </section>

      {/* ── Clinic wallet accounts ── */}
      <section className="rss-section">
        <h3>Clinic Wallet Accounts</h3>
        <p className="rss-hint">Receipts whose recipient doesn't match an active account get flagged for review.</p>
        <table className="rss-table">
          <thead>
            <tr><th>Provider</th><th>Account name</th><th>Last 4 digits</th><th /></tr>
          </thead>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={a.id || `new-${i}`}>
                <td>
                  <select
                    value={a.provider}
                    onChange={(e) => updateAccount(i, { provider: e.target.value })}
                    className="rss-input"
                  >
                    <option value="gcash">GCash</option>
                    <option value="maya">Maya</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={a.account_name}
                    onChange={(e) => updateAccount(i, { account_name: e.target.value })}
                    className="rss-input"
                    placeholder="Pawesome Retreat Inc."
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={a.account_last4 || ""}
                    onChange={(e) => updateAccount(i, { account_last4: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                    className="rss-input rss-input--narrow"
                    placeholder="4567"
                  />
                </td>
                <td>
                  <button type="button" className="rss-icon-btn" onClick={() => removeAccount(i)} title="Remove">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="rss-add-btn" onClick={() => setAccounts((prev) => [...prev, emptyAccount()])}>
          <FontAwesomeIcon icon={faPlus} /> Add account
        </button>
      </section>

      <div className="rss-actions">
        <button type="button" className="rss-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? <><FontAwesomeIcon icon={faSpinner} spin /> Saving…</> : "Save settings"}
        </button>
        <button type="button" className="rss-reload-btn" onClick={load} disabled={loading || saving}>
          <FontAwesomeIcon icon={faRotate} /> Reload
        </button>
      </div>
    </div>
  );
};

export default ReceiptScannerSettings;
