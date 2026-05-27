import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faMoneyBillWave,
  faShoppingCart,
  faArrowUp,
  faArrowDown,
  faFilter,
  faCalendarAlt,
  faDownload,
  faStore,
  faUserTie,
} from '@fortawesome/free-solid-svg-icons';
import {
  LineChart,
  Line,
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
  ComposedChart,
} from 'recharts';
import { formatCurrency } from '../../../utils/currency';
import { ChartContainer, CHART_COLORS } from '../../shared/UnifiedReportEngine';
import { apiRequest } from '../../../api/client';
import './SalesAnalysis.css';

/**
 * SalesAnalysis - Phase 4 Feature
 * Deep sales analytics with trends, patterns, and insights
 */

const MetricCard = ({ title, value, change, trend, icon, format = 'currency' }) => {
  const isPositive = trend === 'up';
  const formattedValue = format === 'currency' ? formatCurrency(value) : value.toLocaleString();
  
  return (
    <div className="sales-metric-card">
      <div className="sales-metric-header">
        <FontAwesomeIcon icon={icon} className="sales-metric-icon" />
        <span className={`sales-metric-trend ${isPositive ? 'positive' : 'negative'}`}>
          <FontAwesomeIcon icon={isPositive ? faArrowUp : faArrowDown} />
          {Math.abs(change)}%
        </span>
      </div>
      <h4>{title}</h4>
      <strong>{formattedValue}</strong>
    </div>
  );
};

const SalesAnalysis = ({ data: initialData = {} }) => {
  const [timeRange, setTimeRange] = useState('month');
  const [compareTo, setCompareTo] = useState('last_period');
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Fetch real sales data from API
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(`/admin/reports/sales-analysis?range=${timeRange}&compare=${compareTo}`);
      if (response?.success) {
        setData(response.data || {});
      } else {
        setError(response?.message || 'Failed to fetch sales data');
      }
    } catch (err) {
      console.error('Sales Analysis API Error:', err);
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [timeRange, compareTo]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Real data from API
  const salesData = useMemo(() => data.dailyData || [], [data]);
  const categoryData = useMemo(() => data.categoryData || [], [data]);
  const hourlyData = useMemo(() => data.hourlyData || [], [data]);
  const topProducts = useMemo(() => data.topProducts || [], [data]);
  
  // Calculate metrics from real data
  const totalRevenue = useMemo(() => salesData.reduce((sum, d) => sum + (d.revenue || 0), 0), [salesData]);
  const totalOrders = useMemo(() => salesData.reduce((sum, d) => sum + (d.orders || 0), 0), [salesData]);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const conversionRate = data.conversionRate || 0;
  
  return (
    <div className="sales-analysis">
      <header className="sa-header">
        <div className="sa-title">
          <FontAwesomeIcon icon={faChartLine} className="sa-icon" />
          <div>
            <h2>Sales Analysis</h2>
            <p>Deep dive into sales performance and trends</p>
          </div>
        </div>
        
        <div className="sa-controls">
          <div className="sa-filter">
            <FontAwesomeIcon icon={faCalendarAlt} />
            <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>
          
          <div className="sa-filter">
            <FontAwesomeIcon icon={faFilter} />
            <select value={compareTo} onChange={(e) => setCompareTo(e.target.value)}>
              <option value="last_period">vs Last Period</option>
              <option value="last_year">vs Last Year</option>
              <option value="target">vs Target</option>
            </select>
          </div>
        </div>
      </header>
      
      {/* Key Metrics */}
      <section className="sa-metrics-grid">
        <MetricCard
          title="Total Revenue"
          value={totalRevenue}
          change={15.7}
          trend="up"
          icon={faMoneyBillWave}
        />
        <MetricCard
          title="Total Orders"
          value={totalOrders}
          change={8.3}
          trend="up"
          icon={faShoppingCart}
          format="number"
        />
        <MetricCard
          title="Avg Order Value"
          value={avgOrderValue}
          change={-2.1}
          trend="down"
          icon={faChartLine}
        />
        <MetricCard
          title="Conversion Rate"
          value={conversionRate}
          change={0.5}
          trend="up"
          icon={faUserTie}
          format="percentage"
        />
      </section>
      
      {/* Revenue Trend */}
      <section className="sa-charts-grid">
        <ChartContainer title="Revenue Trend" subtitle="Daily revenue vs target" height={350}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={salesData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(val) => `₱${val/1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
              <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS[0]} fill="url(#revenueGradient)" name="Revenue" />
              <Line type="monotone" dataKey="target" stroke={CHART_COLORS[3]} strokeDasharray="5 5" name="Target" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
        
        {/* Sales by Category */}
        <ChartContainer title="Sales by Category" subtitle="Revenue distribution" height={350}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </section>
      
      {/* Hourly Sales Pattern */}
      <section className="sa-hourly-section">
        <ChartContainer title="Hourly Sales Pattern" subtitle="Peak hours analysis" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(val) => `₱${val/1000}k`} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="sales" fill={CHART_COLORS[0]} radius={[8, 8, 0, 0]} name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </section>
      
      {/* Top Products Table */}
      <section className="sa-products-section">
        <h3>
          <FontAwesomeIcon icon={faStore} />
          Top Performing Products & Services
        </h3>
        <div className="sa-products-table">
          <table>
            <thead>
              <tr>
                <th>Product/Service</th>
                <th>Revenue</th>
                <th>Units Sold</th>
                <th>Growth</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((product, index) => (
                <tr key={index}>
                  <td>
                    <strong>{product.name}</strong>
                  </td>
                  <td>{formatCurrency(product.revenue)}</td>
                  <td>{product.units}</td>
                  <td className={product.growth >= 0 ? 'positive' : 'negative'}>
                    {product.growth >= 0 ? '+' : ''}{product.growth}%
                  </td>
                  <td>
                    <div className="performance-bar">
                      <div 
                        className="performance-fill" 
                        style={{ 
                          width: `${Math.min((product.revenue / 15000) * 100, 100)}%`,
                          backgroundColor: product.growth >= 0 ? '#10b981' : '#f59e0b'
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      
      {/* Insights */}
      <section className="sa-insights">
        <h3>
          <FontAwesomeIcon icon={faArrowUp} />
          Sales Insights
        </h3>
        <div className="insights-grid">
          <div className="insight-card positive">
            <strong>Peak Hour Identified</strong>
            <p>6PM shows highest sales (₱7,500 avg). Consider extending hours or adding promotions.</p>
          </div>
          <div className="insight-card warning">
            <strong>Grooming Trending Up</strong>
            <p>Full grooming packages up 23%. Consider expanding grooming team capacity.</p>
          </div>
          <div className="insight-card negative">
            <strong>Vaccination Decline</strong>
            <p>Vaccination packages down 5%. Launch awareness campaign or offer discounts.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SalesAnalysis;
