import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCrown,
  faUserClock,
  faUserSlash,
  faUsers,
  faChartPie,
  faArrowUp,
  faArrowDown,
  faExclamationTriangle,
  faBullseye,
  faSync,
} from '@fortawesome/free-solid-svg-icons';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '../../../utils/currency';
import { ChartContainer, CHART_COLORS } from '../../shared/UnifiedReportEngine';
import { apiRequest } from '../../../api/client';
import { showError } from '../../../utils/alert';
import './CustomerSegmentation.css';

/**
 * Customer Segmentation - Phase 3 Feature
 * RFM Analysis: Recency, Frequency, Monetary segmentation
 */

const SegmentCard = ({ title, count, revenue, color, icon, trend, description, action }) => (
  <div className={`segment-card ${color}`}>
    <div className="segment-header">
      <div className={`segment-icon ${color}`}>
        <FontAwesomeIcon icon={icon} />
      </div>
      <div className="segment-trend">
        <FontAwesomeIcon icon={trend === 'up' ? faArrowUp : faArrowDown} />
        <span>{trend === 'up' ? '+12%' : '-8%'}</span>
      </div>
    </div>
    <h3 className="segment-title">{title}</h3>
    <div className="segment-stats">
      <div>
        <strong>{count}</strong>
        <small>Customers</small>
      </div>
      <div>
        <strong>{formatCurrency(revenue)}</strong>
        <small>Revenue</small>
      </div>
    </div>
    <p className="segment-description">{description}</p>
    <button className="segment-action">{action}</button>
  </div>
);

const CustomerSegmentation = ({ data: initialData = {} }) => {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch REAL data from API
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('/admin/reports/customers/segments');
      if (response?.success) {
        setData(response.data || {});
      } else {
        setError(response?.message || 'Failed to fetch customer data');
        showError(response?.message || 'Failed to fetch customer data');
      }
    } catch (err) {
      console.error('Customer Segmentation API Error:', err);
      setError(err.message || 'Network error');
      showError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { customers = [], segments = {}, rfmData = [] } = data;

  // Calculate segments from REAL data
  const segmentAnalysis = useMemo(() => {
    const now = new Date();
    
    const vip = customers.filter(c => c.totalSpent > 50000 && c.orders > 10);
    const loyal = customers.filter(c => c.totalSpent > 20000 && c.orders > 5);
    const atRisk = customers.filter(c => {
      const lastOrder = new Date(c.lastOrderDate);
      const daysSince = (now - lastOrder) / (1000 * 60 * 60 * 24);
      return daysSince > 45 && c.totalSpent > 10000;
    });
    const lost = customers.filter(c => {
      const lastOrder = new Date(c.lastOrderDate);
      const daysSince = (now - lastOrder) / (1000 * 60 * 60 * 24);
      return daysSince > 90;
    });
    const newCustomers = customers.filter(c => c.orders <= 2);

    return {
      vip: {
        count: vip.length,
        revenue: vip.reduce((sum, c) => sum + c.totalSpent, 0),
        avgOrder: vip.length > 0 ? vip.reduce((sum, c) => sum + c.totalSpent, 0) / vip.reduce((sum, c) => sum + c.orders, 0) : 0,
      },
      loyal: {
        count: loyal.length,
        revenue: loyal.reduce((sum, c) => sum + c.totalSpent, 0),
        avgOrder: loyal.length > 0 ? loyal.reduce((sum, c) => sum + c.totalSpent, 0) / loyal.reduce((sum, c) => sum + c.orders, 0) : 0,
      },
      atRisk: {
        count: atRisk.length,
        revenue: atRisk.reduce((sum, c) => sum + c.totalSpent, 0),
        recoverable: atRisk.reduce((sum, c) => sum + c.totalSpent * 0.3, 0), // 30% recovery potential
      },
      lost: {
        count: lost.length,
        revenue: lost.reduce((sum, c) => sum + c.totalSpent, 0),
      },
      new: {
        count: newCustomers.length,
        revenue: newCustomers.reduce((sum, c) => sum + c.totalSpent, 0),
      },
    };
  }, [customers]);

  // Chart data
  const pieData = useMemo(() => [
    { name: 'VIP', value: segmentAnalysis.vip.count, color: CHART_COLORS[0] },
    { name: 'Loyal', value: segmentAnalysis.loyal.count, color: CHART_COLORS[1] },
    { name: 'At Risk', value: segmentAnalysis.atRisk.count, color: CHART_COLORS[4] },
    { name: 'New', value: segmentAnalysis.new.count, color: CHART_COLORS[5] },
    { name: 'Lost', value: segmentAnalysis.lost.count, color: CHART_COLORS[6] },
  ], [segmentAnalysis]);

  const revenueData = useMemo(() => [
    { segment: 'VIP', revenue: segmentAnalysis.vip.revenue },
    { segment: 'Loyal', revenue: segmentAnalysis.loyal.revenue },
    { segment: 'At Risk', revenue: segmentAnalysis.atRisk.revenue },
    { segment: 'New', revenue: segmentAnalysis.new.revenue },
    { segment: 'Lost', revenue: segmentAnalysis.lost.revenue },
  ], [segmentAnalysis]);

  // Loading state
  if (loading) {
    return (
      <div className="customer-segmentation">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faChartPie} spin style={{ fontSize: '3rem', color: '#ff5f93' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading customer segments...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="customer-segmentation">
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

  // No data state
  if (!customers.length) {
    return (
      <div className="customer-segmentation">
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <FontAwesomeIcon icon={faUsers} style={{ fontSize: '3rem', color: '#94a3b8' }} />
          <p style={{ marginTop: '1rem', color: '#64748b' }}>
            No customer data available. Please check your backend API connection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-segmentation">
      <header className="cs-header">
        <div className="cs-title">
          <FontAwesomeIcon icon={faChartPie} className="cs-icon" />
          <div>
            <h2>Customer Segmentation</h2>
            <p>RFM Analysis: Recency, Frequency, Monetary value</p>
          </div>
        </div>
        <div className="cs-meta">
          <span className="cs-badge">
            <FontAwesomeIcon icon={faUsers} />
            {customers.length} Total Customers
          </span>
        </div>
      </header>

      {/* Segment Cards */}
      <section className="cs-segments-grid">
        <SegmentCard
          title="VIP Customers"
          count={segmentAnalysis.vip.count}
          revenue={segmentAnalysis.vip.revenue}
          color="primary"
          icon={faCrown}
          trend="up"
          description="High value, frequent buyers. Your most valuable customers."
          action="View VIP Program"
        />
        <SegmentCard
          title="Loyal Customers"
          count={segmentAnalysis.loyal.count}
          revenue={segmentAnalysis.loyal.revenue}
          color="success"
          icon={faUsers}
          trend="up"
          description="Consistent buyers with good order history."
          action="Send Rewards"
        />
        <SegmentCard
          title="At Risk"
          count={segmentAnalysis.atRisk.count}
          revenue={segmentAnalysis.atRisk.revenue}
          color="warning"
          icon={faUserClock}
          trend="down"
          description={`Haven't ordered in 45+ days. Recovery potential: ${formatCurrency(segmentAnalysis.atRisk.recoverable)}`}
          action="Launch Win-back"
        />
        <SegmentCard
          title="Lost Customers"
          count={segmentAnalysis.lost.count}
          revenue={segmentAnalysis.lost.revenue}
          color="danger"
          icon={faUserSlash}
          trend="down"
          description="No orders in 90+ days. Aggressive re-engagement needed."
          action="Re-engagement Campaign"
        />
      </section>

      {/* Alerts */}
      {segmentAnalysis.atRisk.count > 10 && (
        <div className="cs-alert warning">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <div>
            <strong>At-Risk Alert:</strong> {segmentAnalysis.atRisk.count} customers haven't ordered in 45+ days.
            Potential revenue loss: {formatCurrency(segmentAnalysis.atRisk.revenue)}
          </div>
        </div>
      )}

      {/* Charts */}
      <section className="cs-charts-grid">
        <ChartContainer title="Customer Distribution" subtitle="By segment" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [`${value} customers`, name]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Revenue by Segment" subtitle="Total revenue contribution" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="segment" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(val) => `₱${val/1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                {revenueData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </section>

      {/* Recommendations */}
      <section className="cs-recommendations">
        <h3>
          <FontAwesomeIcon icon={faBullseye} />
          Recommended Actions
        </h3>
        <div className="cs-actions-list">
          <div className="cs-action-item">
            <div className="cs-action-priority high">High</div>
            <div className="cs-action-content">
              <h4>Win-back Campaign for At-Risk</h4>
              <p>Launch targeted email campaign with 15% discount for {segmentAnalysis.atRisk.count} at-risk customers</p>
              <small>Expected recovery: {formatCurrency(segmentAnalysis.atRisk.recoverable)}</small>
            </div>
            <button className="cs-action-btn">Launch</button>
          </div>
          <div className="cs-action-item">
            <div className="cs-action-priority medium">Medium</div>
            <div className="cs-action-content">
              <h4>VIP Appreciation Event</h4>
              <p>Invite {segmentAnalysis.vip.count} VIP customers to exclusive grooming event</p>
              <small>Retention impact: High</small>
            </div>
            <button className="cs-action-btn">Plan Event</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CustomerSegmentation;
