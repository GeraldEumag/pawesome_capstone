import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSync,
  faChartLine,
  faShoppingCart,
  faReceipt,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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

const CHART_COLORS = ['#ff5f93', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#94a3b8'];

const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const SalesAnalysis = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('month');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest(`/admin/reports/sales-analysis?range=${range}`);
      setData(response.data || response);
    } catch (err) {
      setError(err.message || 'Failed to load sales analysis');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = data?.summary || {};
  const dailyData = useMemo(() => data?.dailyData || [], [data]);
  const categoryData = useMemo(() => data?.categoryData || [], [data]);
  const hourlyData = useMemo(() => data?.hourlyData || [], [data]);

  if (loading) {
    return <div className="adv-loading"><p>Loading sales analysis...</p></div>;
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
          <FontAwesomeIcon icon={faChartLine} className="adv-report-icon" />
          <div>
            <h2>Sales Analysis</h2>
            <p>Detailed revenue, category, and hourly breakdown</p>
          </div>
        </div>
        <div className="adv-report-controls">
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="quarter">Last 90 Days</option>
          </select>
          <button className="adv-refresh-btn" onClick={fetchData}>
            <FontAwesomeIcon icon={faSync} /> Refresh
          </button>
        </div>
      </div>

      <div className="adv-kpi-grid">
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon primary"><FontAwesomeIcon icon={faChartLine} /></div>
          <div>
            <span className="adv-kpi-value">{formatCurrency(summary.total_revenue)}</span>
            <span className="adv-kpi-label">Total Revenue</span>
          </div>
        </div>
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon info"><FontAwesomeIcon icon={faShoppingCart} /></div>
          <div>
            <span className="adv-kpi-value">{Number(summary.total_orders || 0).toLocaleString()}</span>
            <span className="adv-kpi-label">Total Orders</span>
          </div>
        </div>
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon success"><FontAwesomeIcon icon={faReceipt} /></div>
          <div>
            <span className="adv-kpi-value">{formatCurrency(summary.avg_order_value)}</span>
            <span className="adv-kpi-label">Avg Order Value</span>
          </div>
        </div>
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon warning"><FontAwesomeIcon icon={faClock} /></div>
          <div>
            <span className="adv-kpi-value">
              {summary.date_range ? `${summary.date_range.from} → ${summary.date_range.to}` : '—'}
            </span>
            <span className="adv-kpi-label">Date Range</span>
          </div>
        </div>
      </div>

      <div className="adv-charts-grid">
        <ChartContainer title="Daily Revenue" subtitle="Revenue and order count per day" height={340}>
          {dailyData.length === 0 ? (
            <div className="adv-empty"><p>No sales data for this range</p></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${v / 1000}k`} />
                <Tooltip formatter={(v, name) => (name === 'revenue' ? formatCurrency(v) : v)} />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS[0]} fill="url(#salesGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>

        <ChartContainer title="Category Breakdown" subtitle="Revenue by sales type" height={340}>
          {categoryData.length === 0 ? (
            <div className="adv-empty"><p>No category data for this range</p></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {categoryData.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>

        <ChartContainer title="Hourly Pattern" subtitle="Sales by time of day" height={300}>
          {hourlyData.length === 0 ? (
            <div className="adv-empty"><p>No hourly data for this range</p></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${v / 1000}k`} />
                <Tooltip formatter={(v, name) => (name === 'sales' ? formatCurrency(v) : v)} />
                <Bar dataKey="sales" name="Sales" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>

      {categoryData.length > 0 && (
        <div className="adv-section">
          <h3>Top Categories</h3>
          <div className="adv-table-wrapper">
            <table className="adv-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Revenue</th>
                  <th>Orders</th>
                  <th>Growth</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.map((cat) => (
                  <tr key={cat.name}>
                    <td>{cat.name}</td>
                    <td>{formatCurrency(cat.value)}</td>
                    <td>{cat.orders}</td>
                    <td>
                      <span className={`adv-kpi-delta ${cat.growth >= 0 ? 'up' : 'down'}`}>
                        {cat.growth >= 0 ? '+' : ''}{cat.growth}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesAnalysis;
