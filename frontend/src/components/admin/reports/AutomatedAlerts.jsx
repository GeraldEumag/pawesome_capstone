import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSync,
  faBell,
  faTrash,
  faPlus,
  faHistory,
} from '@fortawesome/free-solid-svg-icons';
import { apiRequest } from '../../../api/client';
import { showAlert } from '../../../utils/alert';
import './AdvancedReports.css';

const TYPE_LABELS = {
  revenue_drop: 'Revenue Drop',
  low_stock: 'Low Stock',
  pending_approvals: 'Pending Approvals',
};

const EMPTY_FORM = {
  name: '',
  type: 'revenue_drop',
  threshold: '',
  frequency: 'daily',
};

const AutomatedAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest('/admin/reports/alerts');
      const data = response.data || response;
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      setError(err.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await apiRequest('/admin/reports/alerts', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          threshold: Number(form.threshold),
          frequency: form.frequency,
          channels: { dashboard: true, email: true },
          enabled: true,
        }),
      });
      showAlert('Alert created.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchData();
    } catch (err) {
      showAlert(err.message || 'Failed to create alert.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (alert) => {
    try {
      await apiRequest(`/admin/reports/alerts/${alert.id}`, { method: 'DELETE' });
      showAlert('Alert deleted.');
      fetchData();
    } catch (err) {
      showAlert(err.message || 'Failed to delete alert.');
    }
  };

  if (loading) {
    return <div className="adv-loading"><p>Loading alerts...</p></div>;
  }

  if (error) {
    return (
      <div className="adv-error">
        <p>{error}</p>
        <button className="adv-btn primary" onClick={fetchData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="adv-report">
      <div className="adv-report-header">
        <div className="adv-report-title">
          <FontAwesomeIcon icon={faBell} className="adv-report-icon" />
          <div>
            <h2>Automated Alerts</h2>
            <p>Threshold-based alerts evaluated against live data</p>
          </div>
        </div>
        <div className="adv-report-controls">
          <button className="adv-btn primary" onClick={() => setShowForm((v) => !v)}>
            <FontAwesomeIcon icon={faPlus} /> New Alert
          </button>
          <button className="adv-refresh-btn" onClick={fetchData}>
            <FontAwesomeIcon icon={faSync} /> Refresh
          </button>
        </div>
      </div>

      {showForm && (
        <div className="adv-section">
          <h3>Create Alert</h3>
          <form onSubmit={handleCreate}>
            <div className="adv-form-grid">
              <label>
                Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Weekend revenue dip"
                />
              </label>
              <label>
                Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="revenue_drop">Revenue Drop (₱)</option>
                  <option value="low_stock">Low Stock (items)</option>
                  <option value="pending_approvals">Pending Approvals (count)</option>
                </select>
              </label>
              <label>
                Threshold
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                  placeholder={form.type === 'revenue_drop' ? '15000' : '10'}
                />
              </label>
              <label>
                Frequency
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                  <option value="immediate">Immediate</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
            </div>
            <button className="adv-btn primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create Alert'}
            </button>
          </form>
        </div>
      )}

      <div className="adv-section">
        <h3>Configured Alerts ({alerts.length})</h3>
        <div className="adv-table-wrapper">
          <table className="adv-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Threshold</th>
                <th>Frequency</th>
                <th>Channels</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 && (
                <tr><td colSpan={7} className="adv-empty">No alerts configured.</td></tr>
              )}
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{alert.name}</td>
                  <td>{TYPE_LABELS[alert.type] || alert.type}</td>
                  <td>
                    {alert.type === 'revenue_drop'
                      ? '₱' + Number(alert.threshold).toLocaleString()
                      : alert.threshold}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{alert.frequency}</td>
                  <td>
                    {Object.entries(alert.channels || {})
                      .filter(([, on]) => on)
                      .map(([ch]) => ch)
                      .join(', ') || '—'}
                  </td>
                  <td>
                    <span className={`adv-badge ${alert.enabled ? 'enabled' : 'disabled'}`}>
                      {alert.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <button className="adv-btn danger" onClick={() => handleDelete(alert)}>
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="adv-section">
        <h3>
          <FontAwesomeIcon icon={faHistory} style={{ color: '#94a3b8' }} />
          Trigger History
        </h3>
        <div className="adv-table-wrapper">
          <table className="adv-table">
            <thead>
              <tr>
                <th>Alert</th>
                <th>Message</th>
                <th>Triggered At</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={3} className="adv-empty">No alerts triggered yet.</td></tr>
              )}
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.message}</td>
                  <td>{row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AutomatedAlerts;
