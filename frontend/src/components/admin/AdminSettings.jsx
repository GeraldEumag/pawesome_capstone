import React, { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCog,
  faShieldAlt,
  faUsers,
  faDatabase,
  faBell,
  faSave,
  faSpinner,
  faCheckCircle,
  faExclamationTriangle,
  faHistory,
  faUserShield,
  faLock,
  faEnvelope,
  faPalette,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { THEME_PRESETS } from "../../config/themePresets";
import { applyThemeColor, getCurrentThemeColor } from "../../utils/theme";
import "./AdminSettings.css";

const AdminSettings = () => {
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // General Settings
  const [generalSettings, setGeneralSettings] = useState({
    systemName: "Pawesome Admin",
    timezone: "Asia/Manila",
    dateFormat: "MM/DD/YYYY",
    maintenanceMode: false,
  });

  // Security Settings
  const [securitySettings, setSecuritySettings] = useState({
    minPasswordLength: 8,
    requireSpecialChars: true,
    requireNumbers: true,
    requireUppercase: true,
    maxLoginAttempts: 5,
    sessionTimeout: 60,
    twoFactorAuth: false,
  });

  // Notification Settings
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    loginAlerts: true,
    failedLoginAlerts: true,
    dailyReports: false,
    weeklyReports: true,
  });

  // Role Permissions (view-only summary)
  const [roles] = useState([
    {
      name: "admin",
      label: "Administrator",
      permissions: ["Full system access", "User management", "All reports", "System settings"],
    },
    {
      name: "manager",
      label: "Manager",
      permissions: ["Dashboard access", "Staff oversight", "Attendance reports", "Payroll view"],
    },
    {
      name: "receptionist",
      label: "Receptionist",
      permissions: ["Appointments", "Customer management", "Hotel bookings", "POS access"],
    },
    {
      name: "veterinary",
      label: "Veterinarian",
      permissions: ["Medical records", "Appointments", "Patient history", "Prescriptions"],
    },
    {
      name: "cashier",
      label: "Cashier",
      permissions: ["POS system", "Transactions", "Invoices", "Daily reports"],
    },
    {
      name: "inventory",
      label: "Inventory",
      permissions: ["Stock management", "Purchase orders", "Low stock alerts", "Inventory reports"],
    },
    {
      name: "payroll",
      label: "Payroll",
      permissions: ["Salary management", "Payroll processing", "Payslips", "Tax reports"],
    },
    {
      name: "customer",
      label: "Customer",
      permissions: ["Own profile", "Own pets", "Book appointments", "View history"],
    },
  ]);

  // Theme Color
  const [selectedTheme, setSelectedTheme] = useState(getCurrentThemeColor());
  const [themeLoading, setThemeLoading] = useState(false);

  const handleSaveTheme = useCallback(async () => {
    try {
      setThemeLoading(true);
      await apiRequest("/admin/settings/theme", {
        method: "POST",
        body: JSON.stringify({ theme_color: selectedTheme }),
      });
      applyThemeColor(selectedTheme);
      showSuccess("Theme color updated! All users will see the new color on next load.");
    } catch (err) {
      showError("Failed to save theme color.");
    } finally {
      setThemeLoading(false);
    }
  }, [selectedTheme]);

  // System Info
  const [systemInfo, setSystemInfo] = useState({
    lastBackup: null,
    storageUsed: "0 MB",
    totalUsers: 0,
    activeSessions: 0,
  });

  useEffect(() => {
    fetchSettings();
    fetchSystemInfo();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await apiRequest("/admin/settings");
      if (data?.general) setGeneralSettings(data.general);
      if (data?.security) setSecuritySettings(data.security);
      if (data?.notifications) setNotificationSettings(data.notifications);
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  };

  const fetchSystemInfo = async () => {
    try {
      const users = await apiRequest("/admin/users");
      setSystemInfo((prev) => ({
        ...prev,
        totalUsers: users?.data?.length || users?.length || 0,
      }));
    } catch (err) {
      console.error("Error fetching system info:", err);
    }
  };

  const showSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(""), 3000);
  };

  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(""), 5000);
  };

  const handleSaveSettings = async (settingType) => {
    try {
      setLoading(true);
      setError("");

      const endpointMap = {
        General: { path: "/admin/settings/general", payload: generalSettings },
        Security: { path: "/admin/settings/security", payload: securitySettings },
        Notification: { path: "/admin/settings/notifications", payload: notificationSettings },
      };

      const { path, payload } = endpointMap[settingType];
      await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      showSuccess(`${settingType} settings saved successfully`);
    } catch (err) {
      showError(`Failed to save ${settingType} settings`);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "general", label: "General", icon: faCog },
    { id: "appearance", label: "Appearance", icon: faPalette },
    { id: "security", label: "Security", icon: faShieldAlt },
    { id: "roles", label: "Roles & Permissions", icon: faUsers },
    { id: "notifications", label: "Notifications", icon: faBell },
    { id: "system", label: "System Info", icon: faDatabase },
  ];

  return (
    <div className="admin-settings">
      <div className="section-header">
        <div className="header-left">
          <h2>
            <FontAwesomeIcon icon={faCog} /> System Settings
          </h2>
          <p>Configure system-wide settings, security, and role permissions</p>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="success-message">
          <FontAwesomeIcon icon={faCheckCircle} /> {success}
        </div>
      )}
      {error && (
        <div className="error-message">
          <FontAwesomeIcon icon={faExclamationTriangle} /> {error}
        </div>
      )}

      {/* Settings Tabs */}
      <div className="settings-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <FontAwesomeIcon icon={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="settings-content">
        {/* General Settings */}
        {activeTab === "general" && (
          <div className="settings-section">
            <h3>
              <FontAwesomeIcon icon={faCog} /> General Settings
            </h3>
            <div className="settings-form">
              <div className="form-row">
                <div className="form-group">
                  <label>System Name</label>
                  <input
                    type="text"
                    value={generalSettings.systemName}
                    onChange={(e) =>
                      setGeneralSettings({ ...generalSettings, systemName: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Timezone</label>
                  <select
                    value={generalSettings.timezone}
                    onChange={(e) =>
                      setGeneralSettings({ ...generalSettings, timezone: e.target.value })
                    }
                  >
                    <option value="Asia/Manila">Asia/Manila (PHT)</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date Format</label>
                  <select
                    value={generalSettings.dateFormat}
                    onChange={(e) =>
                      setGeneralSettings({ ...generalSettings, dateFormat: e.target.value })
                    }
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={generalSettings.maintenanceMode}
                    onChange={(e) =>
                      setGeneralSettings({
                        ...generalSettings,
                        maintenanceMode: e.target.checked,
                      })
                    }
                  />
                  <span className="checkmark"></span>
                  Enable Maintenance Mode (only admins can access)
                </label>
              </div>
              <button
                className="save-btn"
                onClick={() => handleSaveSettings("General")}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faSave} /> Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Appearance Settings */}
        {activeTab === "appearance" && (
          <div className="settings-section">
            <h3>
              <FontAwesomeIcon icon={faPalette} /> Theme Color
            </h3>
            <p className="settings-description">
              Choose a system-wide color theme. Once saved, all users will see the selected color across the entire application.
            </p>
            <div className="theme-presets-grid">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={`theme-preset-card ${preset.isMix ? "mix-card" : ""} ${selectedTheme === preset.key ? "active" : ""}`}
                  onClick={() => {
                    setSelectedTheme(preset.key);
                    applyThemeColor(preset.key);
                  }}
                  title={preset.description}
                >
                  {preset.isMix && preset.mixColors ? (
                    <span className="theme-swatch-mix">
                      {preset.mixColors.map((color, i) => (
                        <span
                          key={i}
                          className="mix-slice"
                          style={{ background: color }}
                        />
                      ))}
                    </span>
                  ) : (
                    <span
                      className="theme-swatch"
                      style={{
                        background: `linear-gradient(135deg, ${preset.primary}, ${preset.primaryLight}, ${preset.primarySoft})`,
                      }}
                    />
                  )}
                  <span className="theme-emoji">{preset.emoji}</span>
                  <span className="theme-name">{preset.label}</span>
                  {preset.isMix && (
                    <span className="theme-mix-badge">MIX</span>
                  )}
                  {selectedTheme === preset.key && (
                    <span className="theme-check">
                      <FontAwesomeIcon icon={faCheckCircle} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              className="save-btn"
              onClick={handleSaveTheme}
              disabled={themeLoading}
            >
              {themeLoading ? (
                <><FontAwesomeIcon icon={faSpinner} spin /> Saving...</>
              ) : (
                <><FontAwesomeIcon icon={faSave} /> Apply Theme System-Wide</>
              )}
            </button>
          </div>
        )}

        {/* Security Settings */}
        {activeTab === "security" && (
          <div className="settings-section">
            <h3>
              <FontAwesomeIcon icon={faShieldAlt} /> Security Settings
            </h3>
            <div className="settings-form">
              <div className="form-section">
                <h4>
                  <FontAwesomeIcon icon={faLock} /> Password Policy
                </h4>
                <div className="form-row">
                  <div className="form-group">
                    <label>Minimum Password Length</label>
                    <input
                      type="number"
                      min="6"
                      max="32"
                      value={securitySettings.minPasswordLength}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          minPasswordLength: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Login Attempts</label>
                    <input
                      type="number"
                      min="3"
                      max="10"
                      value={securitySettings.maxLoginAttempts}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          maxLoginAttempts: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={securitySettings.requireSpecialChars}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          requireSpecialChars: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Require Special Characters (!@#$%^&*)
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={securitySettings.requireNumbers}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          requireNumbers: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Require Numbers (0-9)
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={securitySettings.requireUppercase}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          requireUppercase: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Require Uppercase Letters (A-Z)
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h4>
                  <FontAwesomeIcon icon={faUserShield} /> Session Management
                </h4>
                <div className="form-group">
                  <label>Session Timeout (minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="480"
                    value={securitySettings.sessionTimeout}
                    onChange={(e) =>
                      setSecuritySettings({
                        ...securitySettings,
                        sessionTimeout: parseInt(e.target.value),
                      })
                    }
                  />
                  <small>Idle time before automatic logout</small>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={securitySettings.twoFactorAuth}
                      onChange={(e) =>
                        setSecuritySettings({
                          ...securitySettings,
                          twoFactorAuth: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Enable Two-Factor Authentication (2FA)
                  </label>
                </div>
              </div>

              <button
                className="save-btn"
                onClick={() => handleSaveSettings("Security")}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faSave} /> Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Roles & Permissions */}
        {activeTab === "roles" && (
          <div className="settings-section">
            <h3>
              <FontAwesomeIcon icon={faUsers} /> Roles & Permissions
            </h3>
            <p className="section-description">
              System roles define what actions users can perform. These are predefined and cannot be modified.
            </p>
            <div className="roles-list">
              {roles.map((role) => (
                <div key={role.name} className="role-card">
                  <div className="role-header">
                    <h4>{role.label}</h4>
                    <span className="role-badge">{role.name}</span>
                  </div>
                  <div className="role-permissions">
                    <h5>Permissions:</h5>
                    <ul>
                      {role.permissions.map((perm, idx) => (
                        <li key={idx}>
                          <FontAwesomeIcon icon={faCheckCircle} /> {perm}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notification Settings */}
        {activeTab === "notifications" && (
          <div className="settings-section">
            <h3>
              <FontAwesomeIcon icon={faBell} /> Notification Settings
            </h3>
            <div className="settings-form">
              <div className="form-section">
                <h4>
                  <FontAwesomeIcon icon={faEnvelope} /> Email Notifications
                </h4>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notificationSettings.emailNotifications}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          emailNotifications: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Enable Email Notifications
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notificationSettings.loginAlerts}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          loginAlerts: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Send Login Alerts to Users
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notificationSettings.failedLoginAlerts}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          failedLoginAlerts: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Alert Admin on Multiple Failed Logins
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h4>
                  <FontAwesomeIcon icon={faHistory} /> Reports
                </h4>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notificationSettings.dailyReports}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          dailyReports: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Daily Summary Reports
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={notificationSettings.weeklyReports}
                      onChange={(e) =>
                        setNotificationSettings({
                          ...notificationSettings,
                          weeklyReports: e.target.checked,
                        })
                      }
                    />
                    <span className="checkmark"></span>
                    Weekly Summary Reports
                  </label>
                </div>
              </div>

              <button
                className="save-btn"
                onClick={() => handleSaveSettings("Notification")}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faSave} /> Save Settings
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* System Info */}
        {activeTab === "system" && (
          <div className="settings-section">
            <h3>
              <FontAwesomeIcon icon={faDatabase} /> System Information
            </h3>
            <div className="system-info-grid">
              <div className="info-card">
                <h4>Users</h4>
                <div className="info-value">{systemInfo.totalUsers}</div>
                <small>Total registered users</small>
              </div>
              <div className="info-card">
                <h4>Last Backup</h4>
                <div className="info-value">
                  {systemInfo.lastBackup || "Never"}
                </div>
                <small>Database backup status</small>
              </div>
              <div className="info-card">
                <h4>Storage Used</h4>
                <div className="info-value">{systemInfo.storageUsed}</div>
                <small>Database storage</small>
              </div>
            </div>

            <div className="system-actions">
              <h4>Maintenance Actions</h4>
              <div className="action-buttons">
                <button className="action-btn secondary" disabled>
                  <FontAwesomeIcon icon={faDatabase} /> Backup Database
                </button>
                <button className="action-btn secondary" disabled>
                  <FontAwesomeIcon icon={faHistory} /> View Error Logs
                </button>
                <button className="action-btn secondary" disabled>
                  <FontAwesomeIcon icon={faLock} /> Clear Cache
                </button>
              </div>
              <p className="note">
                <FontAwesomeIcon icon={faExclamationTriangle} /> Advanced maintenance features require server access.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSettings;
