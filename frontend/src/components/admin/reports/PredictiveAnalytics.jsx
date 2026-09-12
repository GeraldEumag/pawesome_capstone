import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSync,
  faChartLine,
  faLightbulb,
  faChartArea,
  faPercent,
} from '@fortawesome/free-solid-svg-icons';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { apiRequest } from '../../../api/client';
import { ChartContainer } from '../../shared/UnifiedReportEngine';
import './AdvancedReports.css';

const formatCurrency = (amount) => {
  const num = parseFloat(amount) || 0;
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const PredictiveAnalytics = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metric, setMetric] = useState('revenue');
  const [forecastDays, setForecastDays] = useState(30);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest(
        `/admin/reports/predictive?metric=${metric}&forecast_days=${forecastDays}`
      );
      setData(response.data || response);
    } catch (err) {
      setError(err.message || 'Failed to load predictive analytics');
    } finally {
      setLoading(false);
    }
  }, [metric, forecastDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isCurrency = metric === 'revenue';
  const formatValue = (v) => (isCurrency ? formatCurrency(v) : Number(v).toLocaleString());

  // Merge historical + forecast into one series for the composed chart
  const chartData = useMemo(() => {
    const historical = (data?.historical_data || []).map((d) => ({
      date: d.date,
      actual: d.actual,
    }));
    const forecast = (data?.forecast_data || []).map((d) => ({
      date: d.date,
      predicted: d.predicted,
      upper: d.upper_bound,
      lower: d.lower_bound,
    }));
    // Bridge the gap so the forecast line connects to the last actual point
    if (historical.length && forecast.length) {
      forecast[0] = { ...forecast[0], actual: historical[historical.length - 1].actual };
    }
    return [...historical, ...forecast];
  }, [data]);

  const recommendations = data?.recommendations || [];
  const forecastBoundary = data?.historical_data?.length
    ? data.historical_data[data.historical_data.length - 1].date
    : null;

  if (loading) {
    return <div className="adv-loading"><p>Loading predictive analytics...</p></div>;
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
          <FontAwesomeIcon icon={faChartArea} className="adv-report-icon" />
          <div>
            <h2>Predictive Analytics</h2>
            <p>Trend + seasonality forecast projected from the last 90 days</p>
          </div>
        </div>
        <div className="adv-report-controls">
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="revenue">Revenue</option>
            <option value="orders">Orders</option>
          </select>
          <select value={forecastDays} onChange={(e) => setForecastDays(Number(e.target.value))}>
            <option value={14}>14 Days</option>
            <option value={30}>30 Days</option>
            <option value={60}>60 Days</option>
            <option value={90}>90 Days</option>
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
            <span className="adv-kpi-value">{formatValue(data?.forecast_total || 0)}</span>
            <span className="adv-kpi-label">Projected {metric} ({forecastDays} days)</span>
          </div>
        </div>
        <div className="adv-kpi-card">
          <div className={`adv-kpi-icon ${(data?.trend_pct || 0) >= 0 ? 'success' : 'danger'}`}>
            <FontAwesomeIcon icon={faPercent} />
          </div>
          <div>
            <span className="adv-kpi-value">
              {(data?.trend_pct || 0) >= 0 ? '+' : ''}{data?.trend_pct || 0}%
            </span>
            <span className="adv-kpi-label">30-day trend vs prior period</span>
          </div>
        </div>
        <div className="adv-kpi-card">
          <div className="adv-kpi-icon info"><FontAwesomeIcon icon={faChartArea} /></div>
          <div>
            <span className="adv-kpi-value">
              {data?.seasonality?.weekend_boost_pct > 0
                ? `+${data.seasonality.weekend_boost_pct}%`
                : '0%'}
            </span>
            <span className="adv-kpi-label">Weekend uplift factor</span>
          </div>
        </div>
      </div>

      <ChartContainer
        title={`${isCurrency ? 'Revenue' : 'Order'} Forecast`}
        subtitle="Solid: historical actuals · Dashed: projected with confidence band"
        height={380}
      >
        {chartData.length === 0 ? (
          <div className="adv-empty"><p>No data available for forecasting</p></div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => (isCurrency ? `₱${v / 1000}k` : v)} />
              <Tooltip formatter={(v, name) => (v == null ? '—' : name === 'actual' || name === 'predicted' ? formatValue(v) : formatValue(v))} />
              <Legend />
              {forecastBoundary && <ReferenceLine x={forecastBoundary} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Today', fontSize: 10, fill: '#94a3b8' }} />}
              <Area type="monotone" dataKey="upper" name="Upper bound" stroke="none" fill="#ff5f93" fillOpacity={0.12} />
              <Area type="monotone" dataKey="lower" name="Lower bound" stroke="none" fill="#fff" fillOpacity={0} />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="predicted" name="Projected" stroke="#ff5f93" strokeWidth={2} strokeDasharray="6 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartContainer>

      {recommendations.length > 0 && (
        <div className="adv-section">
          <h3>
            <FontAwesomeIcon icon={faLightbulb} style={{ color: '#f59e0b' }} />
            Recommendations
          </h3>
          <div className="adv-rec-list">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="adv-rec-item">
                <span className={`adv-badge ${rec.type || 'opportunity'}`}>{rec.type}</span>
                <div>
                  <h4>{rec.title}</h4>
                  <p>{rec.description}</p>
                  <small>{rec.impact}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PredictiveAnalytics;
