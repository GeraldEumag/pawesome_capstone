import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faStar,
  faTrophy,
  faChartLine,
  faClock,
  faDollarSign,
  faCalendarCheck,
  faMedal,
  faUserTie,
  faSync,
  faExclamationTriangle,
} from '@fortawesome/free-solid-svg-icons';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { formatCurrency } from '../../../utils/currency';
import { ChartContainer, CHART_COLORS } from '../../shared/UnifiedReportEngine';
import { apiRequest } from '../../../api/client';
import { showError } from '../../../utils/alert';
import './StaffPerformance.css';

/**
 * StaffPerformance - Phase 4 Feature
 * Comprehensive staff analytics and performance tracking
 */

const PerformanceBadge = ({ level }) => {
  const badges = {
    excellent: { icon: faTrophy, color: '#f59e0b', label: 'Top Performer' },
    good: { icon: faMedal, color: '#10b981', label: 'High Performer' },
    average: { icon: faStar, color: '#3b82f6', label: 'Solid Performer' },
    needs_improvement: { icon: faUserTie, color: '#64748b', label: 'Developing' },
  };
  
  const badge = badges[level] || badges.average;
  
  return (
    <span className="performance-badge" style={{ backgroundColor: `${badge.color}15`, color: badge.color }}>
      <FontAwesomeIcon icon={badge.icon} />
      {badge.label}
    </span>
  );
};

const StaffCard = ({ staff, onClick }) => (
  <div className="staff-card" onClick={() => onClick(staff)}>
    <div className="staff-avatar">
      {staff.avatar ? (
        <img src={staff.avatar} alt={staff.name} />
      ) : (
        <div className="avatar-placeholder">{staff.name.charAt(0)}</div>
      )}
      <PerformanceBadge level={staff.performanceLevel} />
    </div>
    <div className="staff-info">
      <h4>{staff.name}</h4>
      <p>{staff.role} • {staff.department}</p>
    </div>
    <div className="staff-metrics">
      <div>
        <strong>{staff.rating}</strong>
        <small>Rating</small>
      </div>
      <div>
        <strong>{formatCurrency(staff.revenue)}</strong>
        <small>Revenue</small>
      </div>
    </div>
  </div>
);

const StaffPerformance = ({ data: initialData = {} }) => {
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [timeRange, setTimeRange] = useState('month');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch REAL data from API
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/admin/reports/staff-performance?range=${timeRange}`);
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
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // REAL data from API - NO HARDCODED DATA
  const staffData = useMemo(() => data.staffData || [], [data]);
  const departmentData = useMemo(() => data.departmentData || [], [data]);
  const trendData = useMemo(() => data.trendData || [], [data]);
  
  // Team overview metrics calculated from REAL data
  const teamMetrics = useMemo(() => {
    const totalStaff = staffData.length;
    const avgRating = totalStaff > 0 ? staffData.reduce((sum, s) => sum + (s.rating || 0), 0) / totalStaff : 0;
    const totalRevenue = staffData.reduce((sum, s) => sum + (s.revenue || 0), 0);
    const avgAttendance = totalStaff > 0 ? staffData.reduce((sum, s) => sum + (s.attendance || 0), 0) / totalStaff : 0;
    
    return {
      totalStaff,
      avgRating: avgRating.toFixed(1),
      totalRevenue,
      avgAttendance: avgAttendance.toFixed(0),
      topPerformer: staffData.length > 0 ? staffData.reduce((max, s) => (s.rating || 0) > (max.rating || 0) ? s : max, staffData[0]) : null,
    };
  }, [staffData]);

  // Radar chart data for selected staff - MUST BE BEFORE EARLY RETURNS
  const radarData = useMemo(() => {
    if (!selectedStaff) return [];
    
    return [
      { metric: 'Attendance', value: selectedStaff.attendance, fullMark: 100 },
      { metric: 'Punctuality', value: selectedStaff.punctuality, fullMark: 100 },
      { metric: 'Satisfaction', value: (selectedStaff.customerSatisfaction || 0) * 20, fullMark: 100 },
      { metric: 'Efficiency', value: selectedStaff.efficiency, fullMark: 100 },
      { metric: 'Revenue', value: Math.min(((selectedStaff.revenue || 0) / 50000) * 100, 100), fullMark: 100 },
      { metric: 'Rating', value: (selectedStaff.rating || 0) * 20, fullMark: 100 },
    ];
  }, [selectedStaff]);

  // Early returns must be AFTER all hooks
  if (loading) {
    return (
      <div className="staff-performance">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faUsers} spin style={{ fontSize: '3rem', color: '#ff5f93' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading staff performance data...</p>
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

  if (!staffData.length) {
    return (
      <div className="staff-performance">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faUsers} style={{ fontSize: '3rem', color: '#94a3b8' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>
            No staff data available. Please check your backend API connection.
          </p>
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
            <p>Team analytics and individual performance tracking</p>
          </div>
        </div>
        
        <div className="sp-controls">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </header>
      
      {/* Team Overview */}
      <section className="sp-overview">
        <div className="sp-metric-card">
          <FontAwesomeIcon icon={faUsers} />
          <div>
            <strong>{teamMetrics.totalStaff}</strong>
            <span>Total Staff</span>
          </div>
        </div>
        <div className="sp-metric-card highlight">
          <FontAwesomeIcon icon={faStar} />
          <div>
            <strong>{teamMetrics.avgRating}</strong>
            <span>Avg Rating</span>
          </div>
        </div>
        <div className="sp-metric-card">
          <FontAwesomeIcon icon={faDollarSign} />
          <div>
            <strong>{formatCurrency(teamMetrics.totalRevenue)}</strong>
            <span>Total Revenue</span>
          </div>
        </div>
        <div className="sp-metric-card">
          <FontAwesomeIcon icon={faCalendarCheck} />
          <div>
            <strong>{teamMetrics.avgAttendance}%</strong>
            <span>Avg Attendance</span>
          </div>
        </div>
      </section>
      
      {/* Top Performer */}
      <section className="sp-top-performer">
        <div className="trophy-section">
          <FontAwesomeIcon icon={faTrophy} className="trophy-icon" />
          <div>
            <h3>Top Performer</h3>
            <p>{teamMetrics.topPerformer.name} - {teamMetrics.topPerformer.role}</p>
            <span className="top-rating">
              <FontAwesomeIcon icon={faStar} />
              {teamMetrics.topPerformer.rating} Rating
            </span>
          </div>
        </div>
      </section>
      
      <div className="sp-main-grid">
        {/* Staff List */}
        <section className="sp-staff-list">
          <h3>Team Members</h3>
          <div className="staff-grid">
            {staffData.map((staff) => (
              <StaffCard 
                key={staff.id} 
                staff={staff} 
                onClick={setSelectedStaff}
              />
            ))}
          </div>
        </section>
        
        {/* Selected Staff Detail */}
        {selectedStaff && (
          <section className="sp-staff-detail">
            <div className="detail-header">
              <h3>{selectedStaff.name}</h3>
              <button onClick={() => setSelectedStaff(null)}>×</button>
            </div>
            
            <ChartContainer title="Performance Profile" height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
                  <Radar
                    name={selectedStaff.name}
                    dataKey="value"
                    stroke={CHART_COLORS[0]}
                    fill={CHART_COLORS[0]}
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </ChartContainer>
            
            <div className="detail-metrics">
              <div>
                <strong>{formatCurrency(selectedStaff.revenue)}</strong>
                <span>Revenue Generated</span>
              </div>
              <div>
                <strong>{selectedStaff.customers}</strong>
                <span>Customers Served</span>
              </div>
              <div>
                <strong>{selectedStaff.appointments}</strong>
                <span>Appointments</span>
              </div>
            </div>
          </section>
        )}
      </div>
      
      {/* Department Performance */}
      <section className="sp-departments">
        <h3>Department Performance</h3>
        <div className="department-charts">
          <ChartContainer title="Revenue by Department" height={250}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(val) => `₱${val/1000}k`} />
                <YAxis type="category" dataKey="department" width={100} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill={CHART_COLORS[0]} radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
          
          <ChartContainer title="Team Performance Trend" height={250}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" />
                <YAxis domain={[4, 5]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="rating" stroke={CHART_COLORS[0]} name="Avg Rating" strokeWidth={2} />
                <Line type="monotone" dataKey="target" stroke={CHART_COLORS[4]} strokeDasharray="5 5" name="Target" />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </section>
    </div>
  );
};

export default StaffPerformance;
