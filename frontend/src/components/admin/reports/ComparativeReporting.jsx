import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSync,
  faBalanceScale,
  faChartLine,
  faShoppingCart,
  faUsers,
  faReceipt,
} from '@fortawesome/free-solid-svg-icons';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { apiRequest } from '../../../api/client';
import { ChartContainer } from '../../shared/UnifiedReportEngine';
import './AdvancedReports.css';

const CHART_COLORS = ['#ff5f93', '#94a3b8', '#10b981', '#3b82f6', '#f59e0b'];

const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const pctChange = (current, previous) => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

const ComparisonCard = ({ title, current, previous, icon, isCurrency }) => {
  const change = pctChange(current, previous);
  return (
    <div className="adv-kpi-card">
      <div className={`adv-kpi-icon ${change === null ? 'info' : change >= 0 ? 'success' : 'danger'}`}>
        <FontAwesomeIcon icon={icon} />
      </div>
      <div>
        <span className="adv-kpi-value">
          {isCurrency ? formatCurrency(current) : Number(current).toLocaleString()}
          {change !== null && (
            <span className={`adv-kpi-delta ${change >= 0 ? 'up' : 'down'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
          )}
        </span>
        <span className="adv-kpi-label">
          {title} — prev: {isCurrency ? formatCurrency(previous) : Number(previous).toLocaleString()}
        </span>
      </div>
    </div>
  );
};

const ComparativeReporting = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest('/admin/reports/comparison');
      setData(response.data || response);
    } catch (err) {
      setError(err.message || 'Failed to load comparative report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const comparisonData = data?.comparisonData || {};
  const dailyTrend = useMemo(() => data?.dailyTrend || [], [data]);
  const categoryBreakdown = useMemo(() => data?.categoryBreakdown || [], [data]);

  if (loading) {
    return <div className="adv-loading"><p>Loading comparative report...</p></div>;
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
          <FontAwesomeIcon icon={faBalanceScale} className="adv-report-icon" />
          <div>
            <h2>Comparative Reporting</h2>
            <p>This month vs last month</p>
          </div>
        </div>
        <button className="adv-refresh-btn" onClick={fetchData}>
          <FontAwesomeIcon icon={faSync} /> Refresh
        </button>
      </div>

      <div className="adv-kpi-grid">
        <ComparisonCard
          title="Revenue"
          current={comparisonData.revenue?.current || 0}
          previous={comparisonData.revenue?.previous || 0}
          icon={faChartLine}
          isCurrency
        />
        <ComparisonCard
          title="Orders"
          current={comparisonData.orders?.current || 0}
          previous={comparisonData.orders?.previous || 0}
          icon={faShoppingCart}
        />
        <ComparisonCard
          title="Customers"
          current={comparisonData.customers?.current || 0}
          previous={comparisonData.customers?.previous || 0}
          icon={faUsers}
        />
        <ComparisonCard
          title="Avg Order Value"
          current={comparisonData.avgOrderValue?.current || 0}
          previous={comparisonData.avgOrderValue?.previous || 0}
          icon={faReceipt}
          isCurrency
        />
      </div>

      <div className="adv-charts-grid">
        <ChartContainer title="Daily Revenue Comparison" subtitle="Current vs previous period" height={340}>
          {dailyTrend.length === 0 ? (
            <div className="adv-empty"><p>No comparison data available</p></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${v / 1000}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend />
                <Line type="monotone" dataKey="current" name="This Month" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="previous" name="Last Month" stroke={CHART_COLORS[1]} strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>

        <ChartContainer title="Category Performance" subtitle="Revenue by category, both periods" height={340}>
          {categoryBreakdown.length === 0 ? (
            <div className="adv-empty"><p>No category data available</p></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBreakdown}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${v / 1000}k`} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="current" name="This Month" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="previous" name="Last Month" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>
    </div>
  );
};

export default ComparativeReporting;
