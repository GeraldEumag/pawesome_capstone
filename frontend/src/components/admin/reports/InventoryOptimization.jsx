import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSync,
  faBoxes,
  faExclamationTriangle,
  faChartPie,
} from '@fortawesome/free-solid-svg-icons';
import {
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

const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const InventoryOptimization = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest('/admin/reports/inventory-optimization');
      setData(response.data || response);
    } catch (err) {
      setError(err.message || 'Failed to load inventory optimization');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const abcData = useMemo(() => data?.abcData || [], [data]);
  const stockData = useMemo(() => data?.stockData || [], [data]);
  const reorderRecommendations = useMemo(() => data?.reorderRecommendations || [], [data]);
  const lowStockCount = data?.lowStockCount || 0;

  if (loading) {
    return <div className="adv-loading"><p>Loading inventory optimization...</p></div>;
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
          <FontAwesomeIcon icon={faBoxes} className="adv-report-icon" />
          <div>
            <h2>Inventory Optimization</h2>
            <p>ABC value analysis and reorder recommendations</p>
          </div>
        </div>
        <button className="adv-refresh-btn" onClick={fetchData}>
          <FontAwesomeIcon icon={faSync} /> Refresh
        </button>
      </div>

      <div className="adv-kpi-grid">
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon danger"><FontAwesomeIcon icon={faExclamationTriangle} /></div>
          <div>
            <span className="adv-kpi-value">{lowStockCount}</span>
            <span className="adv-kpi-label">Items at/below reorder level</span>
          </div>
        </div>
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon primary"><FontAwesomeIcon icon={faChartPie} /></div>
          <div>
            <span className="adv-kpi-value">
              {formatCurrency(abcData.reduce((sum, row) => sum + (row.value || 0), 0))}
            </span>
            <span className="adv-kpi-label">Total inventory value</span>
          </div>
        </div>
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon info"><FontAwesomeIcon icon={faBoxes} /></div>
          <div>
            <span className="adv-kpi-value">
              {stockData.reduce((sum, row) => sum + (row.items || 0), 0)}
            </span>
            <span className="adv-kpi-label">Active items tracked</span>
          </div>
        </div>
      </div>

      <div className="adv-charts-grid">
        <ChartContainer title="ABC Analysis" subtitle="Inventory value by class (A = top 70% of value)" height={340}>
          {abcData.length === 0 ? (
            <div className="adv-empty"><p>No inventory data available</p></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={abcData} dataKey="value" nameKey="category" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3}>
                  {abcData.map((entry) => (
                    <Cell key={entry.category} fill={entry.color || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [formatCurrency(v), name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>

        <ChartContainer title="Stock Value by Category" subtitle="Units and value per category" height={340}>
          {stockData.length === 0 ? (
            <div className="adv-empty"><p>No category stock data available</p></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₱${v / 1000}k`} />
                <Tooltip formatter={(v, name) => (name === 'value' ? formatCurrency(v) : v)} />
                <Legend />
                <Bar dataKey="value" name="Value" fill="#ff5f93" radius={[4, 4, 0, 0]} />
                <Bar dataKey="units" name="Units" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>

      <div className="adv-section">
        <h3>Reorder Recommendations ({reorderRecommendations.length})</h3>
        <div className="adv-table-wrapper">
          <table className="adv-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Reorder Level</th>
                <th>Suggested Order Qty</th>
              </tr>
            </thead>
            <tbody>
              {reorderRecommendations.length === 0 && (
                <tr><td colSpan={5} className="adv-empty">No items below reorder level.</td></tr>
              )}
              {reorderRecommendations.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td style={{ color: item.stock <= 0 ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                    {item.stock}
                  </td>
                  <td>{item.reorder_level}</td>
                  <td>{item.suggested_order_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryOptimization;
