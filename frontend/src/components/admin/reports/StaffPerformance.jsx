import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faMoneyBillWave,
  faCalendarCheck,
  faClock,
  faFingerprint,
  faSync,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../../../utils/currency';
import { ChartContainer, CHART_COLORS } from '../../shared/UnifiedReportEngine';
import { apiRequest } from '../../../api/client';
import { showError } from '../../../utils/alert.jsx';
import './StaffPerformance.css';

const StaffPerformance = ({ data: initialData = {} }) => {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/admin/reports/staff-performance');
      if (response?.success) {
        setData(response.data || {});
      } else {
        setError(response?.message || 'Failed to fetch staff data');
        showError(response?.message || 'Failed to fetch staff data');
      }
    } catch (err) {
      console.error('Staff Performance API Error:', err);
      setError(err.message || 'Network error');
      showError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const staff = useMemo(() => data.staffData || [], [data]);

  // Prepare chart data from real API values
  const chartData = useMemo(() => {
    return staff.map((s) => ({
      name: s.name,
      revenue: s.revenue || 0,
      appointments: s.appointments || 0,
      attendance: s.attendanceRate || 0,
    }));
  }, [staff]);

  if (loading) {
    return (
      <div className="staff-performance">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faUsers} spin style={{ fontSize: '3rem', color: '#ff5f93' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading staff data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="staff-performance">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faExclamationTriangle} style={{ fontSize: '3rem', color: '#ef4444' }} />
          <p style={{ marginTop: '1rem', color: '#ef4444' }}>{error}</p>
          <button onClick={fetchData} style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #ff5f93, #ff8db5)', border: 'none', borderRadius: '10px', color: 'white', cursor: 'pointer' }}>
            <FontAwesomeIcon icon={faSync} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="staff-performance">
      <header className="sp-header">
        <div className="sp-title">
          <FontAwesomeIcon icon={faUsers} className="sp-icon" />
          <div>
            <h2>Staff Performance</h2>
            <p>Real metrics from sales, appointments, and attendance (last 30 days)</p>
          </div>
        </div>
      </header>

      {/* Staff Table */}
      <section className="sp-table-section">
        <div className="sp-table-wrapper">
          <table className="sp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Revenue</th>
                <th>Appointments</th>
                <th>Attendance</th>
                <th>Punctuality</th>
                <th>Biometric</th>
                <th>OT Hours</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <br />
                    <small>{member.department}</small>
                  </td>
                  <td>{member.role}</td>
                  <td>{formatCurrency(member.revenue || 0)}</td>
                  <td>{member.appointments || 0}</td>
                  <td>{member.attendanceRate || 0}%</td>
                  <td>{member.punctualityRate || 0}%</td>
                  <td>{member.biometricPunches || 0}</td>
                  <td>{(member.overtimeHours || 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Charts */}
      {chartData.length > 0 && (
        <section className="sp-charts-grid">
          <ChartContainer title="Revenue by Staff" subtitle="Last 30 days" height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(val) => `₱${val / 1000}k`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>

          <ChartContainer title="Attendance Rate" subtitle="Present % (last 30 days)" height={300}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="attendance" fill={CHART_COLORS[2]} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        </section>
      )}
    </div>
  );
};

export default StaffPerformance;
