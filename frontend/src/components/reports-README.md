# Pawesome Reporting System Documentation

## Overview

A comprehensive, unified reporting system for the Pawesome pet care management platform. Features real-time analytics, predictive forecasting, customer segmentation, and automated alerts.

---

## Architecture

### Core Components

#### 1. UnifiedReportEngine
**Location:** `src/components/shared/UnifiedReportEngine.jsx`

The foundation of all reports. Provides standardized:
- Advanced filtering (date presets, status, search, custom filters)
- Export functionality (CSV, PDF, Excel)
- Summary cards with trend indicators
- Chart containers with consistent styling
- Auto-refresh (30-second polling)
- Responsive design with dark mode support

**Usage:**
```jsx
<UnifiedReportEngine
  title="Sales Report"
  subtitle="Detailed sales analytics"
  icon={faChartLine}
  fetchData={fetchReportData}
  data={reportData}
  columns={tableColumns}
  summaryCards={kpiCards}
  charts={chartComponents}
  statusOptions={['pending', 'completed']}
  exportFilename="sales-report"
  enableSavedFilters={true}
  refreshInterval={30000}
/>
```

#### 2. Standard Components
- **StandardReportLayout** - Consistent report wrapper with header, loading, error states
- **StandardTable** - Sortable, paginated data table
- **StandardSummaryCards** - KPI display with trend arrows

---

## Report Types

### Standard Reports (UnifiedReportEngine)
| Report | Role | Features |
|--------|------|----------|
| AdminReports | Admin | 10 sections, KPI trends, revenue charts |
| CashierReports | Cashier | Payment methods, daily sales, filters |
| ReceptionistReports | Receptionist | Transactions, appointment tracking |
| VetReports | Veterinary | Service revenue, appointment distribution |
| ManagerReports | Manager | Attendance, payroll, staff performance |
| InventoryReports | Inventory | Stock levels, category breakdown |

### Advanced Reports (Phase 2 & 3)

#### ExecutiveDashboard
**Purpose:** Real-time business intelligence
- Live KPI monitoring with trend indicators
- Anomaly detection alerts
- 30-day performance charts
- Period comparisons

#### PredictiveAnalytics
**Purpose:** AI-powered forecasting
- 30-day revenue/orders/customer forecasts
- Confidence intervals (upper/lower bounds)
- AI recommendations with impact analysis
- Historical vs predicted comparison

#### CustomerSegmentation
**Purpose:** RFM Analysis (Recency, Frequency, Monetary)
- VIP Customer identification
- Loyal customer tracking
- At-risk customer alerts with recovery potential
- Lost customer win-back campaigns

#### AutomatedAlerts
**Purpose:** Intelligent notification system
- Configurable alert thresholds
- Multi-channel notifications (Email/SMS/Dashboard)
- Alert history and status tracking
- Digest settings (daily/weekly)

#### ComparativeReporting
**Purpose:** Period-over-period analysis
- Primary vs comparison period selector
- YoY growth tracking
- Category performance comparison
- Daily trend charts

---

## Design System

### Color Palette
```css
--ure-primary: #ff5f93      /* Pawesome Pink */
--ure-success: #10b981      /* Green */
--ure-warning: #f59e0b      /* Amber */
--ure-danger: #ef4444       /* Red */
--ure-info: #3b82f6        /* Blue */
--ure-money: #059669       /* Dark Green */
```

### Typography
- Headings: Inter, 600-700 weight
- Body: Inter, 400 weight
- Small/Meta: 0.75rem - 0.875rem

### Spacing Scale
- xs: 0.25rem (4px)
- sm: 0.5rem (8px)
- md: 1rem (16px)
- lg: 1.5rem (24px)
- xl: 2rem (32px)

---

## Performance Features

### Code Splitting
Advanced components use React.lazy() for on-demand loading:
```jsx
const ExecutiveDashboard = lazy(() => import("./reports/ExecutiveDashboard"));
```

### Memoization
- All expensive calculations wrapped in `useMemo`
- Event handlers use `useCallback`
- UnifiedReportEngine wrapped in `React.memo()`

### Suspense
Loading states with animated spinners for better UX:
```jsx
<Suspense fallback={<AdvancedReportLoading />}>
  <ExecutiveDashboard />
</Suspense>
```

### Error Boundaries
ReportErrorBoundary catches errors without crashing the app:
```jsx
<ReportErrorBoundary onRetry={refetchData}>
  <AdvancedReport />
</ReportErrorBoundary>
```

---

## Backend API Integration

### Required Endpoints

#### Executive Dashboard
```
GET /admin/reports/overview
Response: { summary, revenue_trend, anomalies, comparisons }
```

#### Predictive Analytics
```
GET /admin/reports/predictive?forecast_days=30
Response: { historical_data, forecast_data, recommendations }
```

#### Customer Segmentation
```
GET /admin/reports/customers/segments
Response: { customers, segments, recommendations }
```

#### Comparative Reporting
```
GET /admin/reports/comparison?primary_period=month&comparison_period=last_month
Response: { primary_period, comparison_period, changes, daily_trend }
```

#### Automated Alerts
```
GET /admin/reports/alerts
POST /admin/reports/alerts
DELETE /admin/reports/alerts/{id}
```

---

## Usage Examples

### Adding a New Standard Report

1. Create component using UnifiedReportEngine:
```jsx
import UnifiedReportEngine from "../shared/UnifiedReportEngine";

const NewReport = () => {
  const fetchData = useCallback(async (filters) => {
    const response = await apiRequest('/api/reports/new');
    return response.data;
  }, []);

  return (
    <UnifiedReportEngine
      title="New Report"
      fetchData={fetchData}
      columns={[...]}
      summaryCards={[...]}
    />
  );
};
```

### Adding a New Advanced Report

1. Create component in `src/components/admin/reports/`:
```jsx
const NewAdvancedReport = ({ data }) => {
  return <div>Advanced content here</div>;
};
```

2. Export from `index.js`:
```jsx
export { default as NewAdvancedReport } from './NewAdvancedReport';
```

3. Add to AdminReports SECTION_CONFIG:
```jsx
{
  key: "new_advanced",
  label: "New Advanced Report",
  endpoint: "/admin/reports/new",
  icon: faIcon,
  isAdvanced: true,
}
```

4. Add to renderAdvancedContent switch:
```jsx
case 'new_advanced':
  return <NewAdvancedReport data={activeReport} />;
```

---

## Testing

### Manual Testing Checklist
- [ ] All 16 report sections load without errors
- [ ] Filters work correctly (date, status, search)
- [ ] Exports generate valid CSV/PDF/Excel files
- [ ] Charts render with correct data
- [ ] Auto-refresh updates data every 30 seconds
- [ ] Mobile responsive design works
- [ ] Dark mode toggles correctly
- [ ] Error boundaries catch simulated errors

### Performance Testing
- [ ] Lighthouse score > 80
- [ ] First Contentful Paint < 2s
- [ ] Time to Interactive < 3s
- [ ] Bundle size < 500KB (lazy loaded)

---

## Troubleshooting

### Common Issues

**Issue:** Charts not rendering
**Solution:** Check if Recharts is installed: `npm install recharts`

**Issue:** Export not working
**Solution:** Verify jspdf and xlsx are installed: `npm install jspdf-autotable xlsx`

**Issue:** Date filters not working
**Solution:** Check `getDateRangePreset` import from `utils/reportExport`

**Issue:** Component not lazy loading
**Solution:** Ensure default export in component file

---

## Future Enhancements

### Phase 4 (Planned)
- Real-time WebSocket updates
- Drag-and-drop dashboard builder
- Custom report builder
- Scheduled email reports
- Advanced permissions system

### Phase 5 (Planned)
- Machine learning anomaly detection
- Natural language queries
- Voice-activated reports
- AR/VR data visualization

---

## Contributors

**Lead Developer:** Cascade AI  
**UI/UX Design:** Pawesome Design Team  
**Backend Integration:** TBD  

---

## License

Proprietary - Pawesome Pet Care Management System

---

**Last Updated:** May 27, 2026  
**Version:** 2.0 (Phase 2 & 3 Complete)
