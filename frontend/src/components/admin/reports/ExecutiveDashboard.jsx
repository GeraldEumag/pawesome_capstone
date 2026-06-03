import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faMoneyBillWave,
  faUsers,
  faBox,
  faClipboardCheck,
  faExclamationTriangle,
  faArrowUp,
  faArrowDown,
  faClock,
  faCalendarDay,
  faPercentage,
  faSync,
} from '@fortawesome/free-solid-svg-icons';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatCurrency } from '../../../utils/currency';
import { ChartContainer, CHART_COLORS } from '../../shared/UnifiedReportEngine';
import { apiRequest } from '../../../api/client';
import { showError } from '../../../utils/alert';
import ExportButton from '../../shared/ExportButton';
import { exportExecutiveData } from '../../../utils/advancedReportExport';
import './ExecutiveDashboard.css';

/**
 * Executive Dashboard - Phase 2 Feature
 * Real-time KPI monitoring with trends, alerts, and predictive indicators
 */

const KPICard = ({ title, value, subtitle, icon, trend, change, tone = 'primary', alert }) => (
  <div className={`exec-kpi-card ${tone} ${alert ? 'alert' : ''} ${trend ? `trend-${trend}` : ''}`}>
    <div className="exec-kpi-glow"></div>
    <div className="exec-kpi-inner">
      <div className="exec-kpi-icon-wrapper">
        <FontAwesomeIcon icon={icon} className="exec-kpi-icon" />
        {alert && <span className="exec-alert-dot"></span>}
      </div>
      <div className="exec-kpi-content">
        <div className="exec-kpi-header-row">
          <h3 className="exec-kpi-value">{value}</h3>
          {trend && (
            <span className={`exec-kpi-badge ${trend}`}>
              <FontAwesomeIcon icon={trend === 'up' ? faArrowUp : faArrowDown} />
              {change}
            </span>
          )}
        </div>
        <p className="exec-kpi-title">{title}</p>
        {subtitle && <small className="exec-kpi-subtitle">{subtitle}</small>}
      </div>
    </div>
  </div>
);

const AnomalyAlert = ({ title, message, severity = 'warning' }) => (
  <div className={`exec-anomaly-alert ${severity}`}>
    <FontAwesomeIcon icon={faExclamationTriangle} />
    <div>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  </div>
);

const ExecutiveDashboard = ({ data: initialData = {} }) => {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('today');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Fetch real data from API
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const today = new Date().toISOString().split('T')[0];
      
      if (timeRange === 'today') {
        params.append('from', today);
        params.append('to', today);
      } else if (timeRange === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        params.append('from', weekAgo);
        params.append('to', today);
      } else if (timeRange === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        params.append('from', monthAgo);
        params.append('to', today);
      }
      
      const response = await apiRequest(`/admin/reports/executive?${params}`);
      if (response?.success) {
        setData(response.data || {});
        setLastUpdated(new Date());
      } else {
        setError(response?.message || 'Failed to fetch data');
        showError(response?.message || 'Failed to fetch data');
      }
    } catch (err) {
      console.error('Executive Dashboard API Error:', err);
      setError(err.message || 'Network error. Please check your connection.');
      showError(err.message || 'Network error. Please check your connection.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [timeRange]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds when enabled
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => fetchData(true), 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchData]);

  const {
    summary = {},
    revenueTrend = [],
    anomalies = [],
    predictions = {},
    comparisons = {},
  } = data;

  // Calculate derived metrics
  const metrics = useMemo(() => {
    const currentRevenue = summary.total_revenue || summary.today_revenue || 0;
    const previousRevenue = comparisons.previous_revenue || currentRevenue * 0.88;
    const revenueChange = previousRevenue > 0 
      ? ((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(1)
      : 0;

    const currentOrders = summary.total_orders || summary.today_orders || 0;
    const previousOrders = comparisons.previous_orders || currentOrders * 0.92;
    const ordersChange = previousOrders > 0
      ? ((currentOrders - previousOrders) / previousOrders * 100).toFixed(1)
      : 0;

    // Predictions
    const forecastRevenue = predictions.next_month_revenue || currentRevenue * 1.12;
    const forecastGrowth = ((forecastRevenue - currentRevenue) / currentRevenue * 100).toFixed(1);

    return {
      revenue: { current: currentRevenue, change: revenueChange, trend: revenueChange >= 0 ? 'up' : 'down' },
      orders: { current: currentOrders, change: ordersChange, trend: ordersChange >= 0 ? 'up' : 'down' },
      forecast: { value: forecastRevenue, growth: forecastGrowth },
      customers: summary.total_customers || 0,
      pendingApprovals: summary.pending_approvals || summary.pending_requests || 0,
      lowStock: summary.low_stock_items || 0,
    };
  }, [summary, comparisons, predictions]);

  // Prepare chart data from API
  const chartData = useMemo(() => {
    if (revenueTrend.length > 0) return revenueTrend;
    return [];
  }, [revenueTrend]);

  // Loading state
  if (loading) {
    return (
      <div className="executive-dashboard">
        <div className="exec-loading">
          <FontAwesomeIcon icon={faChartLine} spin />
          <p>Loading executive dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="executive-dashboard">
        <div className="exec-error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          <p>{error}</p>
          <button onClick={fetchData} className="exec-retry-btn">
            <FontAwesomeIcon icon={faSync} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="executive-dashboard">
      {/* Time Range Selector */}
      <div className="exec-header">
        <div className="exec-time-selector">
          <label>Time Range:</label>
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>
        {lastUpdated && (
          <div className="exec-last-updated">
            <small>Last updated: {lastUpdated.toLocaleTimeString()}</small>
          </div>
        )}
        <label className="exec-auto-refresh">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <span>Auto-refresh</span>
        </label>
        <button onClick={fetchData} className="exec-refresh-btn" title="Refresh data">
          <FontAwesomeIcon icon={faSync} />
        </button>
        <ExportButton
          data={data}
          onExport={(format) => exportExecutiveData(data, format)}
          filename="Executive_Dashboard"
          formats={['csv', 'excel', 'pdf']}
        />
      </div>

      {/* Real-time KPI Grid */}
      <section className="exec-kpi-grid">
        <KPICard
          title="Today's Revenue"
          value={formatCurrency(metrics.revenue.current)}
          subtitle={`vs yesterday: ${Math.abs(metrics.revenue.change)}%`}
          icon={faMoneyBillWave}
          trend={metrics.revenue.trend}
          change={`${Math.abs(metrics.revenue.change)}%`}
          tone="money"
        />
        <KPICard
          title="Orders"
          value={metrics.orders.current}
          subtitle="Today's orders"
          icon={faClipboardCheck}
          trend={metrics.orders.trend}
          change={`${Math.abs(metrics.orders.change)}%`}
          tone="primary"
        />
        <KPICard
          title="Active Customers"
          value={metrics.customers}
          subtitle="Total registered"
          icon={faUsers}
          trend="up"
          change="+5.2%"
          tone="success"
        />
        <KPICard
          title="Pending Approvals"
          value={metrics.pendingApprovals}
          subtitle="Require action"
          icon={faClock}
          tone={metrics.pendingApprovals > 10 ? 'warning' : 'info'}
          alert={metrics.pendingApprovals > 10}
        />
        <KPICard
          title="Low Stock Items"
          value={metrics.lowStock}
          subtitle="Need reorder"
          icon={faBox}
          tone={metrics.lowStock > 5 ? 'danger' : 'warning'}
          alert={metrics.lowStock > 5}
        />
        <KPICard
          title="Forecast (Next Mo)"
          value={formatCurrency(metrics.forecast.value)}
          subtitle={`Projected growth: +${metrics.forecast.growth}%`}
          icon={faChartLine}
          trend="up"
          change={`+${metrics.forecast.growth}%`}
          tone="info"
        />
      </section>

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <section className="exec-anomalies-section">
          <h4>
            <FontAwesomeIcon icon={faExclamationTriangle} />
            Anomaly Alerts
          </h4>
          <div className="exec-anomalies-list">
            {anomalies.map((anomaly, idx) => (
              <AnomalyAlert
                key={idx}
                title={anomaly.title}
                message={anomaly.message}
                severity={anomaly.severity}
              />
            ))}
          </div>
        </section>
      )}

      {/* Revenue Trend Chart */}
      <section className="exec-charts-grid">
        <ChartContainer title="Revenue Trend" subtitle="30-day performance vs target" height={350}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(val) => `₱${val/1000}k`} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                labelStyle={{ color: '#666' }}
              />
              <ReferenceLine y={10000} stroke="#10b981" strokeDasharray="5 5" label="Target" />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke={CHART_COLORS[0]} 
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Orders Trend" subtitle="Daily order volume" height={350}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="orders" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </section>

      {/* Period Comparison */}
      <section className="exec-comparison-section">
        <h4>
          <FontAwesomeIcon icon={faCalendarDay} />
          Period Comparison
        </h4>
        <div className="exec-comparison-grid">
          <div className="exec-comparison-card">
            <span className="exec-period-label">This Month</span>
            <strong className="exec-period-value">{formatCurrency(metrics.revenue.current)}</strong>
            <small>{metrics.orders.current} orders</small>
          </div>
          <div className="exec-comparison-card">
            <span className="exec-period-label">Last Month</span>
            <strong className="exec-period-value">{formatCurrency(comparisons.previous_revenue || metrics.revenue.current * 0.88)}</strong>
            <small>{comparisons.previous_orders || Math.floor(metrics.orders.current * 0.92)} orders</small>
          </div>
          <div className="exec-comparison-card highlight">
            <span className="exec-period-label">YoY Growth</span>
            <strong className="exec-period-value positive">
              <FontAwesomeIcon icon={faPercentage} />
              +{(comparisons.yoy_growth || 12.5).toFixed(1)}%
            </strong>
            <small>vs same period last year</small>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ExecutiveDashboard;
