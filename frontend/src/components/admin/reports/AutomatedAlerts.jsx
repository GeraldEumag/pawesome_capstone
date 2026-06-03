import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faExclamationTriangle,
  faCheckCircle,
  faClock,
  faCog,
  faPlus,
  faTrash,
  faEdit,
  faToggleOn,
  faToggleOff,
  faEnvelope,
  faMobileAlt,
  faDesktop,
  faSync,
} from '@fortawesome/free-solid-svg-icons';
import { apiRequest } from '../../../api/client';
import { showError } from '../../../utils/alert';
import './AutomatedAlerts.css';

/**
 * Automated Alerts - Phase 3 Feature
 * Configure and manage automated report alerts and notifications
 */

const alertTypes = [
  { id: 'revenue_drop', label: 'Revenue Drop', description: 'Alert when daily revenue drops below threshold', icon: faExclamationTriangle, defaultThreshold: 10000 },
  { id: 'low_stock', label: 'Low Stock', description: 'Alert when inventory items reach reorder level', icon: faExclamationTriangle, defaultThreshold: 10 },
  { id: 'pending_approvals', label: 'Pending Approvals', description: 'Alert when approvals exceed threshold', icon: faClock, defaultThreshold: 5 },
  { id: 'daily_summary', label: 'Daily Summary', description: 'Receive daily summary at specified time', icon: faCheckCircle, defaultThreshold: 0 },
  { id: 'weekly_report', label: 'Weekly Report', description: 'Receive weekly performance report', icon: faCheckCircle, defaultThreshold: 0 },
];

const AlertConfigCard = ({ alert, onToggle, onEdit, onDelete }) => {
  const [isEnabled, setIsEnabled] = useState(alert.enabled);
  
  const handleToggle = () => {
    setIsEnabled(!isEnabled);
    onToggle(alert.id, !isEnabled);
  };
  
  const typeInfo = alertTypes.find(t => t.id === alert.type) || alertTypes[0];
  
  return (
    <div className={`alert-config-card ${isEnabled ? 'enabled' : 'disabled'}`}>
      <div className="alert-config-header">
        <div className="alert-config-icon">
          <FontAwesomeIcon icon={typeInfo.icon} />
        </div>
        <div className="alert-config-info">
          <h4>{alert.name || typeInfo.label}</h4>
          <p>{typeInfo.description}</p>
        </div>
        <button 
          className={`alert-toggle ${isEnabled ? 'on' : 'off'}`}
          onClick={handleToggle}
        >
          <FontAwesomeIcon icon={isEnabled ? faToggleOn : faToggleOff} />
        </button>
      </div>
      
      <div className="alert-config-details">
        <div className="alert-detail">
          <small>Threshold</small>
          <strong>{alert.threshold || typeInfo.defaultThreshold}</strong>
        </div>
        <div className="alert-detail">
          <small>Notify via</small>
          <div className="alert-channels">
            {alert.channels?.email && <FontAwesomeIcon icon={faEnvelope} title="Email" />}
            {alert.channels?.sms && <FontAwesomeIcon icon={faMobileAlt} title="SMS" />}
            {alert.channels?.dashboard && <FontAwesomeIcon icon={faDesktop} title="Dashboard" />}
          </div>
        </div>
        <div className="alert-detail">
          <small>Frequency</small>
          <strong>{alert.frequency || 'Immediate'}</strong>
        </div>
      </div>
      
      <div className="alert-config-actions">
        <button className="alert-btn edit" onClick={() => onEdit(alert)}>
          <FontAwesomeIcon icon={faEdit} /> Edit
        </button>
        <button className="alert-btn delete" onClick={() => onDelete(alert.id)}>
          <FontAwesomeIcon icon={faTrash} /> Delete
        </button>
      </div>
    </div>
  );
};

const AlertHistoryItem = ({ alert }) => (
  <div className={`alert-history-item ${alert.status}`}>
    <div className="alert-history-icon">
      <FontAwesomeIcon icon={alert.status === 'triggered' ? faExclamationTriangle : faCheckCircle} />
    </div>
    <div className="alert-history-content">
      <h5>{alert.title}</h5>
      <p>{alert.message}</p>
      <small>{alert.timestamp}</small>
    </div>
    <div className={`alert-history-status ${alert.status}`}>
      {alert.status}
    </div>
  </div>
);

const AutomatedAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('active');

  // Fetch REAL alerts from API
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/admin/reports/alerts');
      if (response?.success) {
        setAlerts(response.data?.alerts || []);
        setHistory(response.data?.history || []);
      } else {
        setError(response?.message || 'Failed to fetch alerts');
        showError(response?.message || 'Failed to fetch alerts');
      }
    } catch (err) {
      console.error('Automated Alerts API Error:', err);
      setError(err.message || 'Network error');
      showError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);
  
  const handleToggle = (id, enabled) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, enabled } : a));
  };
  
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this alert?')) {
      try {
        await apiRequest(`/admin/reports/alerts/${id}`, 'DELETE');
        setAlerts(alerts.filter(a => a.id !== id));
      } catch (err) {
        console.error('Delete alert error:', err);
        alert('Failed to delete alert. Please try again.');
      }
    }
  };
  
  const handleEdit = (alert) => {
    // Open edit modal (simplified for now)
    console.log('Edit alert:', alert);
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="automated-alerts">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faBell} spin style={{ fontSize: '3rem', color: '#ff5f93' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading alerts...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="automated-alerts">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faExclamationTriangle} style={{ fontSize: '3rem', color: '#ef4444' }} />
          <p style={{ marginTop: '1rem', color: '#ef4444' }}>{error}</p>
          <button onClick={fetchAlerts} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #ff5f93, #ff8db5)', border: 'none', borderRadius: '10px', color: 'white', cursor: 'pointer' }}>
            <FontAwesomeIcon icon={faSync} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="automated-alerts">
      <header className="aa-header">
        <div className="aa-title">
          <FontAwesomeIcon icon={faBell} className="aa-icon" />
          <div>
            <h2>Automated Alerts</h2>
            <p>Configure intelligent notifications and automated reports</p>
          </div>
        </div>
        <button className="aa-add-btn">
          <FontAwesomeIcon icon={faPlus} />
          New Alert
        </button>
      </header>
      
      {/* Stats Overview */}
      <section className="aa-stats">
        <div className="aa-stat-card">
          <FontAwesomeIcon icon={faBell} />
          <div>
            <strong>{alerts.filter(a => a.enabled).length}</strong>
            <span>Active Alerts</span>
          </div>
        </div>
        <div className="aa-stat-card">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <div>
            <strong>{history.filter(h => h.status === 'triggered').length}</strong>
            <span>Triggered Today</span>
          </div>
        </div>
        <div className="aa-stat-card">
          <FontAwesomeIcon icon={faCheckCircle} />
          <div>
            <strong>{history.filter(h => h.status === 'delivered').length}</strong>
            <span>Delivered</span>
          </div>
        </div>
      </section>
      
      {/* Tabs */}
      <div className="aa-tabs">
        <button 
          className={activeTab === 'active' ? 'active' : ''}
          onClick={() => setActiveTab('active')}
        >
          Active Alerts ({alerts.length})
        </button>
        <button 
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          Alert History ({history.length})
        </button>
        <button 
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          <FontAwesomeIcon icon={faCog} />
          Settings
        </button>
      </div>
      
      {/* Content */}
      {activeTab === 'active' && (
        <section className="aa-alerts-grid">
          {alerts.map(alert => (
            <AlertConfigCard
              key={alert.id}
              alert={alert}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
          
          <button className="aa-add-card">
            <FontAwesomeIcon icon={faPlus} />
            <span>Create New Alert</span>
          </button>
        </section>
      )}
      
      {activeTab === 'history' && (
        <section className="aa-history">
          {history.map(item => (
            <AlertHistoryItem key={item.id} alert={item} />
          ))}
        </section>
      )}
      
      {activeTab === 'settings' && (
        <section className="aa-settings">
          <div className="aa-setting-group">
            <h4>Notification Preferences</h4>
            <label className="aa-setting">
              <span>Default Email Notifications</span>
              <input type="checkbox" defaultChecked />
            </label>
            <label className="aa-setting">
              <span>SMS Notifications</span>
              <input type="checkbox" />
            </label>
            <label className="aa-setting">
              <span>Dashboard Notifications</span>
              <input type="checkbox" defaultChecked />
            </label>
          </div>
          
          <div className="aa-setting-group">
            <h4>Digest Settings</h4>
            <label className="aa-setting">
              <span>Daily Summary Time</span>
              <input type="time" defaultValue="18:00" />
            </label>
            <label className="aa-setting">
              <span>Weekly Report Day</span>
              <select defaultValue="monday">
                <option value="monday">Monday</option>
                <option value="friday">Friday</option>
                <option value="sunday">Sunday</option>
              </select>
            </label>
          </div>
        </section>
      )}
    </div>
  );
};

export default AutomatedAlerts;
