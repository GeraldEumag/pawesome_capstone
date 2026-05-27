# Backend API Specifications for Advanced Reporting

## Overview
This document outlines the new API endpoints required to support the advanced reporting features in Phase 2 & 3.

---

## Executive Dashboard API

### GET /admin/reports/overview
**Purpose:** Real-time KPI monitoring with trends

**Query Parameters:**
- `from` (date): Start date
- `to` (date): End date

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_revenue": 125000.00,
      "today_revenue": 8500.00,
      "yesterday_revenue": 7200.00,
      "total_orders": 450,
      "today_orders": 32,
      "active_customers": 120,
      "pending_approvals": 8,
      "low_stock_items": 5
    },
    "revenue_trend": [
      { "date": "2024-01-01", "revenue": 12000, "orders": 15 },
      { "date": "2024-01-02", "revenue": 15000, "orders": 18 },
      ...
    ],
    "anomalies": [
      {
        "title": "Revenue Drop",
        "message": "Daily revenue dropped 25% below average",
        "severity": "warning",
        "detected_at": "2024-01-15T10:00:00Z"
      }
    ],
    "comparisons": {
      "previous_revenue": 108000,
      "previous_orders": 380,
      "yoy_growth": 15.7
    }
  }
}
```

---

## Predictive Analytics API

### GET /admin/reports/predictive
**Purpose:** AI-powered forecasting and trend analysis

**Query Parameters:**
- `forecast_days` (int): Days to forecast (default: 30)
- `metric` (string): 'revenue', 'orders', or 'customers'

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "historical_data": [
      { "date": "2024-01-01", "actual": 12000 },
      ...
    ],
    "forecast_data": [
      { 
        "date": "2024-02-01", 
        "predicted": 14200, 
        "upper_bound": 15800, 
        "lower_bound": 12600,
        "confidence": 85
      },
      ...
    ],
    "seasonality": {
      "weekend_boost": 1.23,
      "monthly_peak": "last_friday"
    },
    "recommendations": [
      {
        "type": "opportunity",
        "title": "Weekend Revenue Spike Expected",
        "description": "Based on historical patterns, revenue typically increases 23% on weekends",
        "impact": "+₱15,000 potential",
        "action": "View Schedule"
      }
    ]
  }
}
```

---

## Customer Segmentation API (RFM Analysis)

### GET /admin/reports/customers/segments
**Purpose:** RFM Analysis and customer segmentation

**Query Parameters:**
- `recency_days` (int): Days to consider for recency (default: 90)
- `min_orders` (int): Minimum orders for loyal/VIP status

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": 1,
        "name": "John Doe",
        "last_order_date": "2024-01-10",
        "total_spent": 65000,
        "orders": 12,
        "segment": "vip"
      },
      ...
    ],
    "segments": {
      "vip": {
        "count": 25,
        "revenue": 1250000,
        "avg_order_value": 520
      },
      "loyal": {
        "count": 45,
        "revenue": 890000,
        "avg_order_value": 320
      },
      "at_risk": {
        "count": 32,
        "revenue": 450000,
        "recoverable_potential": 135000
      },
      "lost": {
        "count": 18,
        "revenue": 120000
      },
      "new": {
        "count": 28,
        "revenue": 95000
      }
    },
    "recommendations": [
      {
        "type": "win_back",
        "target_segment": "at_risk",
        "customer_count": 32,
        "campaign": "15% discount",
        "expected_recovery": 135000
      }
    ]
  }
}
```

---

## Comparative Reporting API

### GET /admin/reports/comparison
**Purpose:** Period-over-period analysis

**Query Parameters:**
- `primary_period` (string): 'today', 'week', 'month', 'quarter', 'year'
- `comparison_period` (string): 'yesterday', 'last_week', 'last_month', etc.
- `metric` (string): 'revenue', 'orders', 'customers', 'all'

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "primary_period": {
      "label": "This Month",
      "revenue": 125000,
      "orders": 450,
      "customers": 120,
      "avg_order_value": 278
    },
    "comparison_period": {
      "label": "Last Month",
      "revenue": 108000,
      "orders": 380,
      "customers": 95,
      "avg_order_value": 284
    },
    "changes": {
      "revenue": { "value": 17000, "percent": 15.7 },
      "orders": { "value": 70, "percent": 18.4 },
      "customers": { "value": 25, "percent": 26.3 },
      "avg_order_value": { "value": -6, "percent": -2.1 }
    },
    "daily_trend": [
      { "day": "Mon", "current": 12000, "previous": 10000 },
      ...
    ],
    "category_breakdown": [
      { "category": "Services", "current": 45000, "previous": 38000 },
      ...
    ],
    "yoy_growth": [
      { "month": "Jan", "growth": 12 },
      { "month": "Feb", "growth": 8 },
      ...
    ]
  }
}
```

---

## Automated Alerts API

### GET /admin/reports/alerts
**Purpose:** Get configured alerts and their status

**Response:**
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": 1,
        "name": "Revenue Drop Alert",
        "type": "revenue_drop",
        "enabled": true,
        "threshold": 15000,
        "channels": { "email": true, "sms": false, "dashboard": true },
        "frequency": "immediate"
      }
    ],
    "history": [
      {
        "id": 1,
        "alert_name": "Revenue Drop Alert",
        "triggered_at": "2024-01-15T14:30:00Z",
        "status": "triggered",
        "message": "Daily revenue dropped below threshold"
      }
    ],
    "stats": {
      "active_alerts": 5,
      "triggered_today": 2,
      "delivered": 45
    }
  }
}
```

### POST /admin/reports/alerts
**Purpose:** Create or update alert

**Request:**
```json
{
  "name": "Low Stock Alert",
  "type": "low_stock",
  "enabled": true,
  "threshold": 10,
  "channels": { "email": true, "sms": true, "dashboard": true },
  "frequency": "daily"
}
```

### DELETE /admin/reports/alerts/{id}
**Purpose:** Delete alert

---

## Implementation Notes

### Database Schema Additions

```sql
-- Alerts table
CREATE TABLE report_alerts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    threshold DECIMAL(10,2),
    channels JSON,
    frequency VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Alert history table
CREATE TABLE report_alert_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    alert_id INT NOT NULL,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20),
    message TEXT,
    data_snapshot JSON
);

-- Customer RFM scores
ALTER TABLE customers ADD COLUMN rfm_recency_score TINYINT DEFAULT 0;
ALTER TABLE customers ADD COLUMN rfm_frequency_score TINYINT DEFAULT 0;
ALTER TABLE customers ADD COLUMN rfm_monetary_score TINYINT DEFAULT 0;
ALTER TABLE customers ADD COLUMN segment VARCHAR(20) DEFAULT 'new';
```

### Recommended Implementation Priority

1. **Phase 1 (Immediate):**
   - GET /admin/reports/overview (Executive Dashboard)
   - Customer segmentation calculation (background job)

2. **Phase 2 (Week 1):**
   - GET /admin/reports/comparison
   - GET /admin/reports/predictive (simplified)

3. **Phase 3 (Week 2):**
   - Alerts API (CRUD operations)
   - Alert triggering mechanism (scheduled job)

### Performance Considerations

- Use Redis for caching report data (TTL: 5 minutes)
- Pre-calculate RFM scores nightly via cron job
- For predictive analytics, use simple linear regression initially
- Add database indexes on `orders.created_at`, `customers.last_order_date`
