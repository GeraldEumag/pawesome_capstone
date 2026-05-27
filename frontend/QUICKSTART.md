# Quick Start Guide - Pawesome Reporting System

## 🚀 Getting Started (5 minutes)

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Development Server
```bash
npm start
```

### 3. Access Reports
Navigate to: `http://localhost:3000/admin/reports`

---

## 📊 What's New (Phase 2 & 3)

### 5 New Advanced Report Sections

1. **Executive Dashboard** - Real-time KPIs with anomaly detection
2. **Predictive Analytics** - AI-powered 30-day forecasting
3. **Customer Segments** - RFM analysis (VIP/Loyal/At-Risk/Lost)
4. **Comparative Analysis** - Period-over-period comparison
5. **Automated Alerts** - Intelligent notification system

---

## 🧪 Testing the Reports

### Test Standard Reports
1. Go to Admin → Reports
2. Click through all 10 standard sections:
   - Executive Summary, Sales, Payments, Services, Inventory, Customers, Veterinary, Cashier, Payroll, System Health
3. Verify filters work (date range, status, search)
4. Test exports (CSV, PDF, Excel)

### Test Advanced Reports
1. Click blue-highlighted tabs (Executive Dashboard, Predictive Analytics, etc.)
2. Verify lazy loading (loading spinner appears)
3. Check error handling (error boundary catches issues)

---

## 🔧 Common Development Tasks

### Add a New Standard Report Section

**File:** `src/components/admin/AdminReports.jsx`

```javascript
// Add to SECTION_CONFIG array
{
  key: "new_section",
  label: "New Section Name",
  endpoint: "/admin/reports/new",
  icon: faNewIcon,
  tableKeys: ["data"],
  tableTitle: "New Records",
}
```

### Add a New Advanced Component

**Step 1:** Create file `src/components/admin/reports/MyNewReport.jsx`

```jsx
import React from 'react';

const MyNewReport = ({ data }) => {
  return <div>My Advanced Report Content</div>;
};

export default MyNewReport;
```

**Step 2:** Export from `src/components/admin/reports/index.js`

```javascript
export { default as MyNewReport } from './MyNewReport';
```

**Step 3:** Add lazy import to AdminReports.jsx

```javascript
const MyNewReport = lazy(() => import("./reports/MyNewReport"));
```

**Step 4:** Add to SECTION_CONFIG with `isAdvanced: true`

**Step 5:** Add case to renderAdvancedContent()

```javascript
case 'my_new_report':
  return <MyNewReport data={activeReport} />;
```

---

## 🎨 Customization Guide

### Change Color Scheme

**File:** `src/components/shared/UnifiedReportEngine.css`

```css
:root {
  --ure-primary: #your-color;
  --ure-success: #your-success-color;
  --ure-warning: #your-warning-color;
}
```

### Add New Chart Type

**Example:** Adding a Pie Chart

```jsx
import { PieChart, Pie, Cell } from 'recharts';

<PieChart>
  <Pie data={data} dataKey="value">
    {data.map((entry, index) => (
      <Cell key={index} fill={CHART_COLORS[index]} />
    ))}
  </Pie>
</PieChart>
```

### Modify Auto-Refresh Interval

**In any report component:**

```jsx
<UnifiedReportEngine
  refreshInterval={60000} // 60 seconds instead of 30
/>
```

---

## 🐛 Debugging

### View Component Props
```javascript
// Add to any component
useEffect(() => {
  console.log('Component props:', props);
}, [props]);
```

### Check API Response
```javascript
// In fetchReportData function
const response = await apiRequest(endpoint);
console.log('API Response:', response);
```

### Enable React DevTools Profiler
1. Install React DevTools browser extension
2. Open DevTools → Profiler
3. Record performance profile while using reports

---

## 📈 Performance Monitoring

### Check Bundle Size
```bash
npm run build
npx serve -s build
# Check console for bundle analysis
```

### Lighthouse Audit
1. Open Chrome DevTools
2. Go to Lighthouse tab
3. Run audit on reports page
4. Target scores: Performance > 80, Accessibility > 90

---

## 🔐 Backend Integration (Next Steps)

### Required API Endpoints

1. **Executive Dashboard**
   - `GET /admin/reports/overview`
   
2. **Predictive Analytics**
   - `GET /admin/reports/predictive`
   
3. **Customer Segmentation**
   - `GET /admin/reports/customers/segments`
   
4. **Comparative Reporting**
   - `GET /admin/reports/comparison`
   
5. **Automated Alerts**
   - `GET /admin/reports/alerts`
   - `POST /admin/reports/alerts`
   - `DELETE /admin/reports/alerts/{id}`

See `backend/API_SPECIFICATIONS.md` for full details.

---

## 🆘 Troubleshooting

### Build Errors

**Error:** `Module not found: Can't resolve 'recharts'`
**Fix:** `npm install recharts`

**Error:** `'getDateRangePreset' is not defined`
**Fix:** Add import: `import { getDateRangePreset } from "../../utils/reportExport";`

**Error:** `'CHART_COLORS' is not defined`
**Fix:** Add constant: `const CHART_COLORS = ["#ff5f93", "#ff8db5", ...];`

### Runtime Errors

**Error:** Component not rendering
**Check:** Verify component has `export default`

**Error:** Lazy loading not working
**Check:** Ensure `Suspense` wrapper is present

**Error:** Charts blank
**Check:** Verify data format matches chart requirements

---

## 📞 Support

**For Issues:** Check `reports-README.md`  
**For API Specs:** Check `backend/API_SPECIFICATIONS.md`  
**For Architecture:** Check `IMPLEMENTATION_STATUS.md`

---

## ✅ Pre-Launch Checklist

- [ ] All 16 report sections accessible
- [ ] Filters working on all reports
- [ ] Exports generate valid files
- [ ] Charts display correctly
- [ ] Auto-refresh functioning
- [ ] Mobile responsive (test on phone)
- [ ] Dark mode works
- [ ] Error boundaries tested
- [ ] Performance audited (Lighthouse > 80)
- [ ] Backend APIs documented
- [ ] QA sign-off

---

**Ready to launch!** 🚀
