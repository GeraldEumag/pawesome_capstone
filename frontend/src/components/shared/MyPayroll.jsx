import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faWallet,
  faDownload,
  faPrint,
  faEye,
  faSpinner,
  faCalendarDays,
  faMoneyBillWave,
  faCircleCheck,
  faCircle,
  faClock,
} from "@fortawesome/free-solid-svg-icons";
import { exportFormalReportPDF } from "../../utils/formalReportPdf";
import { payrollApi } from "../../api/payroll";
import { apiRequest } from "../../api/client";
import { formatCurrency } from "../../utils/currency";
import { STORE_INFO } from "../../utils/storeInfo";
import { showAlert, showSuccess } from "../../utils/alert.jsx";
import "./MyPayroll.css";

const formatLabel = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "N/A");
const formatDate = (d) => (d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" }) : "N/A");
const formatDateTime = (d) => (d ? new Date(d).toLocaleString("en-PH") : "N/A");

const STATUS_ICONS = {
  paid: { icon: faCircleCheck, color: "#10b981" },
  pending: { icon: faClock, color: "#f59e0b" },
  draft: { icon: faCircle, color: "#6b7280" },
  processing: { icon: faSpinner, color: "#3b82f6" },
  cancelled: { icon: faCircle, color: "#ef4444" },
};

// Semi-monthly periods (1–15 / 16–end) pay half the monthly base.
const periodFactorFor = (payroll, slip) => {
  if (slip?.period_factor != null) return Number(slip.period_factor);
  const start = payroll?.pay_period_start;
  const end = payroll?.pay_period_end;
  if (!start || !end) return 1;
  const sd = new Date(start);
  const ed = new Date(end);
  if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return 1;
  return sd.getFullYear() === ed.getFullYear() &&
    sd.getMonth() === ed.getMonth() &&
    (ed - sd) / 86400000 < 20
    ? 0.5
    : 1;
};

const periodBaseSalary = (payroll, slip) =>
  slip?.earnings?.base_salary != null
    ? Number(slip.earnings.base_salary)
    : Number(payroll?.base_salary ?? 0) * periodFactorFor(payroll, slip);

const paidLeaveDaysOf = (payroll, slip) =>
  Number(slip?.attendance?.paid_leave_days ?? payroll?.paid_leave_days ?? 0);

const MyPayroll = ({ roleAccent = "#0891b2", roleLabel = "Employee" }) => {
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [payslipData, setPayslipData] = useState(null);
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [printPayroll, setPrintPayroll] = useState(null);

  const fetchPayrolls = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      let result;
      try {
        result = await payrollApi.getMyPayroll();
      } catch {
        result = await apiRequest("/my-payroll");
      }
      const records = Array.isArray(result) ? result : (result?.data || result?.payrolls || []);
      setPayrolls(records);
    } catch (err) {
      setError(err.message || "Failed to load payroll records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPayrolls(); }, [fetchPayrolls]);

  const summary = useMemo(() => {
    if (!payrolls.length) return { total: 0, paid: 0, pending: 0, totalNet: 0 };
    return {
      total: payrolls.length,
      paid: payrolls.filter((p) => p.status === "paid").length,
      pending: payrolls.filter((p) => p.status === "pending" || p.status === "draft" || p.status === "processing").length,
      totalNet: payrolls.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.net_pay || 0), 0),
    };
  }, [payrolls]);

  const viewPayslip = async (payroll) => {
    setSelectedPayroll(payroll);
    setPayslipLoading(true);
    setPayslipData(null);
    try {
      const id = payroll.id || payroll.payroll_id;
      let result;
      try {
        result = await payrollApi.getMyPayslip(id);
      } catch {
        result = await apiRequest(`/my-payroll/${id}/payslip`);
      }
      setPayslipData(result?.data || result);
    } catch (err) {
      setPayslipData(payroll); // fall back to list data
    } finally {
      setPayslipLoading(false);
    }
  };

  const closePayslip = () => {
    setSelectedPayroll(null);
    setPayslipData(null);
  };

  const downloadPayslipPDF = (payroll, slip) => {
    const empName = payroll.user?.name || payroll.employee_name || payroll.employeeName || "Employee";
    const empDept = payroll.department || "Not recorded";
    const empRole = payroll.position || payroll.role || "Not recorded";
    const payPeriod = payroll.pay_period_label || payroll.pay_period || payroll.period || "Not specified";
    const payrollId = payroll.payroll_id || payroll.payrollId || "N/A";
    const baseSalary = periodBaseSalary(payroll, slip);
    const overtimePay = Number(slip?.earnings?.overtime_pay ?? payroll.overtime_pay ?? payroll.overtimePay ?? 0);
    const bonus = Number(slip?.earnings?.bonus ?? payroll.bonus ?? 0);
    const allowances = Number(slip?.earnings?.allowances ?? payroll.allowances ?? payroll.allowance ?? 0);
    const grossPay = Number(slip?.earnings?.gross_pay ?? payroll.gross_pay ?? payroll.grossPay ?? 0);
    const sss = Number(slip?.deductions?.sss ?? payroll.sss_contribution ?? 0);
    const philhealth = Number(slip?.deductions?.philhealth ?? payroll.philhealth_contribution ?? 0);
    const pagibig = Number(slip?.deductions?.pagibig ?? payroll.pagibig_contribution ?? 0);
    const tax = Number(slip?.deductions?.tax ?? payroll.tax_deduction ?? 0);
    const lateDed = Number(slip?.deductions?.late_deductions ?? payroll.late_deductions ?? payroll.lateDeductions ?? 0);
    const absentDed = Number(slip?.deductions?.absent_deductions ?? payroll.absent_deductions ?? payroll.absenceDeductions ?? 0);
    const otherDed = Number(slip?.deductions?.other_deductions ?? payroll.deductions ?? 0);
    const totalDed = sss + philhealth + pagibig + tax + lateDed + absentDed + otherDed;
    const paidLeaveDays = paidLeaveDaysOf(payroll, slip);
    const netPay = Number(slip?.net_pay ?? payroll.net_pay ?? payroll.netPay ?? 0);
    const presentDays = slip?.attendance?.present_days ?? payroll.present_days ?? "N/A";
    const absentDays = slip?.attendance?.absent_days ?? payroll.absent_days ?? "N/A";
    const regHours = slip?.attendance?.regular_hours ?? payroll.regular_hours ?? payroll.regularHours ?? "N/A";
    const otHours = slip?.attendance?.overtime_hours ?? payroll.overtime_hours ?? payroll.overtimeHours ?? "N/A";
    const payDate = slip?.payment_date || payroll.payment_date || "Not recorded";
    const payMethod = slip?.payment_method || payroll.payment_method || "Not recorded";

    exportFormalReportPDF({
      docRef: `PAYSLIP-${payrollId}`,
      title: "Employee Payslip",
      subtitle: "Confidential payroll statement",
      periodLabel: payPeriod,
      preparedBy: "Payroll Department",
      preparedRole: "System-generated payroll record",
      infoFields: [
        { label: "Employee", value: empName },
        { label: "Payroll ID", value: payrollId },
        { label: "Department", value: empDept },
        { label: "Position", value: empRole },
        { label: "Status", value: formatLabel(payroll.status) },
        { label: "Payment Date", value: payDate === "Not recorded" ? payDate : formatDate(payDate) },
        { label: "Payment Method", value: payMethod },
        { label: "Attendance", value: `${presentDays} present; ${absentDays} absent; ${paidLeaveDays} paid leave` },
        { label: "Hours", value: `${regHours} regular; ${otHours} overtime` },
      ],
      summaryCards: [
        { label: "Gross Pay", value: formatCurrency(grossPay) },
        { label: "Deductions", value: formatCurrency(totalDed) },
        { label: "Net Pay", value: formatCurrency(netPay) },
      ],
      table: {
        title: "Earnings and Deductions Statement",
        columns: [
          { header: "Section", key: "section" },
          { header: "Description", key: "description" },
          { header: "Amount", value: (row) => row.amount == null ? "" : formatCurrency(row.amount), align: "right" },
        ],
        rows: [
          { section: "Earnings", description: "Base Salary", amount: baseSalary },
          { section: "Earnings", description: "Overtime Pay", amount: overtimePay },
          { section: "Earnings", description: "Bonus", amount: bonus },
          { section: "Earnings", description: "Allowances", amount: allowances },
          { section: "Earnings", description: "Gross Pay", amount: grossPay },
          { section: "Deductions", description: "SSS Contribution", amount: sss },
          { section: "Deductions", description: "PhilHealth Contribution", amount: philhealth },
          { section: "Deductions", description: "Pag-IBIG Contribution", amount: pagibig },
          { section: "Deductions", description: "Withholding Tax", amount: tax },
          { section: "Deductions", description: "Late Deductions", amount: lateDed },
          { section: "Deductions", description: "Absence Deductions", amount: absentDed },
          ...(paidLeaveDays > 0 ? [{ section: "Attendance", description: "Paid Leave Days (not deducted)", amount: null }] : []),
          { section: "Deductions", description: "Other Deductions", amount: otherDed },
          { section: "Deductions", description: "Total Deductions", amount: totalDed },
          { section: "Net Pay", description: "Net Pay", amount: netPay },
        ],
        foot: ["", "Net Pay Due", formatCurrency(netPay)],
      },
      findings: [`Gross pay of ${formatCurrency(grossPay)} less total deductions of ${formatCurrency(totalDed)} results in net pay of ${formatCurrency(netPay)} for this period.`],
      recommendations: ["Review all earning and deduction lines. Raise discrepancies with the Payroll Department before acknowledging receipt."],
      certification: "This payslip is a confidential payroll record generated from payroll data for the period stated. It is not proof of disbursement unless payment status and transaction evidence confirm payment.",
      signatures: [
        { role: "Prepared by", name: "", caption: "Payroll Department" },
        { role: "Reviewed by", name: "", caption: "Authorized Payroll Reviewer" },
        { role: "Received by", name: empName, caption: "Employee Signature" },
      ],
      filename: `Payslip-${empName.replace(/\s+/g, "_")}-${String(payPeriod).replace(/\s+/g, "_")}`,
    });
  };

  const printPayslip = (payroll) => {
    setPrintPayroll(payroll);
    window.setTimeout(() => window.print(), 150);
  };

  return (
    <div className="my-payroll-page">
      <section className="my-payroll-hero" style={{ "--mp-accent": roleAccent }}>
        <div>
          <span className="mp-eyebrow"><FontAwesomeIcon icon={faWallet} /> {roleLabel} Self-Service</span>
          <h1>My Payroll</h1>
          <p>View your payroll records, download payslips, and track payment status.</p>
        </div>
        <button className="mp-btn refresh" onClick={fetchPayrolls} disabled={loading}>
          <FontAwesomeIcon icon={faSpinner} spin={loading} /> Refresh
        </button>
      </section>

      {/* Summary cards */}
      <div className="mp-summary-grid">
        <div className="mp-summary-card">
          <FontAwesomeIcon icon={faMoneyBillWave} className="mp-summary-icon" />
          <div>
            <span className="mp-summary-label">Total Records</span>
            <span className="mp-summary-value">{summary.total}</span>
          </div>
        </div>
        <div className="mp-summary-card paid">
          <FontAwesomeIcon icon={faCircleCheck} className="mp-summary-icon" />
          <div>
            <span className="mp-summary-label">Paid</span>
            <span className="mp-summary-value">{summary.paid}</span>
          </div>
        </div>
        <div className="mp-summary-card pending">
          <FontAwesomeIcon icon={faClock} className="mp-summary-icon" />
          <div>
            <span className="mp-summary-label">Pending</span>
            <span className="mp-summary-value">{summary.pending}</span>
          </div>
        </div>
        <div className="mp-summary-card net">
          <FontAwesomeIcon icon={faWallet} className="mp-summary-icon" />
          <div>
            <span className="mp-summary-label">Total Net Paid</span>
            <span className="mp-summary-value">{formatCurrency(summary.totalNet)}</span>
          </div>
        </div>
      </div>

      {error && <div className="mp-error">{error}</div>}

      {/* Payroll list */}
      <div className="mp-table-wrapper">
        <h2>Payroll History</h2>
        {loading ? (
          <div className="mp-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading payroll records...</div>
        ) : payrolls.length === 0 ? (
          <div className="mp-empty">No payroll records found.</div>
        ) : (
          <table className="mp-table">
            <thead>
              <tr>
                <th>Payroll ID</th>
                <th>Pay Period</th>
                <th>Gross Pay</th>
                <th>Deductions</th>
                <th>Net Pay</th>
                <th>Status</th>
                <th>Payment Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map((p) => {
                const totalDed = Number(p.sss_contribution || 0) + Number(p.philhealth_contribution || 0) +
                  Number(p.pagibig_contribution || 0) + Number(p.tax_deduction || 0) +
                  Number(p.late_deductions || 0) + Number(p.absent_deductions || 0) + Number(p.deductions || 0);
                const statusIcon = STATUS_ICONS[p.status] || STATUS_ICONS.draft;
                return (
                  <tr key={p.id || p.payroll_id}>
                    <td>{p.payroll_id || "N/A"}</td>
                    <td>{p.pay_period_label || "N/A"}</td>
                    <td>{formatCurrency(p.gross_pay)}</td>
                    <td>{formatCurrency(totalDed)}</td>
                    <td className="mp-net-cell">{formatCurrency(p.net_pay)}</td>
                    <td>
                      <span className="mp-status" style={{ color: statusIcon.color }}>
                        <FontAwesomeIcon icon={statusIcon.icon} /> {formatLabel(p.status)}
                      </span>
                    </td>
                    <td>{formatDate(p.payment_date)}</td>
                    <td className="mp-actions">
                      <button className="mp-action-btn" onClick={() => viewPayslip(p)} title="View">
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                      {p.status === "paid" && (
                        <>
                          <button className="mp-action-btn" onClick={() => downloadPayslipPDF(p, null)} title="Download PDF">
                            <FontAwesomeIcon icon={faDownload} />
                          </button>
                          <button className="mp-action-btn" onClick={() => printPayslip(p)} title="Print">
                            <FontAwesomeIcon icon={faPrint} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Payslip modal */}
      {selectedPayroll && (
        <div className="mp-modal-overlay" onClick={closePayslip}>
          <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mp-modal-header">
              <h2>Payslip Details</h2>
              <button className="mp-modal-close" onClick={closePayslip}>&times;</button>
            </div>
            {payslipLoading ? (
              <div className="mp-loading"><FontAwesomeIcon icon={faSpinner} spin /> Loading payslip...</div>
            ) : (
              <PayslipDetail payroll={selectedPayroll} slip={payslipData} roleAccent={roleAccent} />
            )}
            <div className="mp-modal-footer">
              <button className="mp-btn" onClick={closePayslip}>Close</button>
              <button className="mp-btn primary" onClick={() => downloadPayslipPDF(selectedPayroll, payslipData)}>
                <FontAwesomeIcon icon={faDownload} /> Download PDF
              </button>
              <button className="mp-btn" onClick={() => printPayslip(selectedPayroll)}>
                <FontAwesomeIcon icon={faPrint} /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print area */}
      {printPayroll && (
        <PayslipPrintArea payroll={printPayroll} slip={payslipData} />
      )}
    </div>
  );
};

const PayslipDetail = ({ payroll, slip, roleAccent }) => {
  const sss = Number(slip?.deductions?.sss ?? payroll.sss_contribution ?? 0);
  const philhealth = Number(slip?.deductions?.philhealth ?? payroll.philhealth_contribution ?? 0);
  const pagibig = Number(slip?.deductions?.pagibig ?? payroll.pagibig_contribution ?? 0);
  const tax = Number(slip?.deductions?.tax ?? payroll.tax_deduction ?? 0);
  const lateDed = Number(slip?.deductions?.late_deductions ?? payroll.late_deductions ?? 0);
  const absentDed = Number(slip?.deductions?.absent_deductions ?? payroll.absent_deductions ?? 0);
  const otherDed = Number(slip?.deductions?.other_deductions ?? payroll.deductions ?? 0);
  const totalDed = sss + philhealth + pagibig + tax + lateDed + absentDed + otherDed;

  return (
    <div className="mp-payslip-detail">
      <div className="mp-payslip-header">
        <h3>{STORE_INFO.name}</h3>
        <p>{STORE_INFO.address}</p>
        <p>{STORE_INFO.phone}</p>
        <h4>Employee Payslip</h4>
      </div>

      <div className="mp-payslip-info-grid">
        <div><strong>Employee</strong><span>{payroll.user?.name || payroll.employee_name || "N/A"}</span></div>
        <div><strong>Payroll ID</strong><span>{payroll.payroll_id || "N/A"}</span></div>
        <div><strong>Department</strong><span>{payroll.department || "N/A"}</span></div>
        <div><strong>Position</strong><span>{payroll.position || payroll.role || "N/A"}</span></div>
        <div><strong>Pay Period</strong><span>{payroll.pay_period_label || "N/A"}</span></div>
        <div><strong>Status</strong><span>{formatLabel(payroll.status)}</span></div>
      </div>

      <table className="mp-payslip-table">
        <thead>
          <tr><th>Earnings</th><th>Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>{periodFactorFor(payroll, slip) === 0.5 ? "Base Salary (half-month cutoff)" : "Base Salary"}</td>
            <td>{formatCurrency(periodBaseSalary(payroll, slip))}</td>
          </tr>
          <tr><td>Overtime Pay</td><td>{formatCurrency(payroll.overtime_pay)}</td></tr>
          <tr><td>Bonus</td><td>{formatCurrency(payroll.bonus)}</td></tr>
          <tr><td>Allowances</td><td>{formatCurrency(payroll.allowances)}</td></tr>
          <tr className="mp-subtotal-row"><td>Gross Pay</td><td>{formatCurrency(payroll.gross_pay)}</td></tr>
        </tbody>
      </table>

      <table className="mp-payslip-table">
        <thead>
          <tr><th>Deductions</th><th>Amount</th></tr>
        </thead>
        <tbody>
          <tr><td>SSS Contribution</td><td>{formatCurrency(sss)}</td></tr>
          <tr><td>PhilHealth Contribution</td><td>{formatCurrency(philhealth)}</td></tr>
          <tr><td>Pag-IBIG Contribution</td><td>{formatCurrency(pagibig)}</td></tr>
          <tr><td>Withholding Tax</td><td>{formatCurrency(tax)}</td></tr>
          <tr><td>Late Deductions</td><td>{formatCurrency(lateDed)}</td></tr>
          <tr><td>Absence Deductions</td><td>{formatCurrency(absentDed)}</td></tr>
          {paidLeaveDaysOf(payroll, slip) > 0 && (
            <tr><td>Paid Leave Days (converted, not deducted)</td><td>{paidLeaveDaysOf(payroll, slip)} day(s)</td></tr>
          )}
          <tr><td>Other Deductions</td><td>{formatCurrency(otherDed)}</td></tr>
          <tr className="mp-subtotal-row"><td>Total Deductions</td><td>{formatCurrency(totalDed)}</td></tr>
        </tbody>
      </table>

      <div className="mp-net-pay" style={{ color: roleAccent }}>
        Net Pay: {formatCurrency(payroll.net_pay)}
      </div>

      <div className="mp-payment-info">
        <span><strong>Payment Date:</strong> {formatDate(payroll.payment_date)}</span>
        <span><strong>Payment Method:</strong> {payroll.payment_method || "N/A"}</span>
      </div>
    </div>
  );
};

const PayslipPrintArea = ({ payroll, slip }) => {
  const sss = Number(slip?.deductions?.sss ?? payroll.sss_contribution ?? 0);
  const philhealth = Number(slip?.deductions?.philhealth ?? payroll.philhealth_contribution ?? 0);
  const pagibig = Number(slip?.deductions?.pagibig ?? payroll.pagibig_contribution ?? 0);
  const tax = Number(slip?.deductions?.tax ?? payroll.tax_deduction ?? 0);
  const lateDed = Number(slip?.deductions?.late_deductions ?? payroll.late_deductions ?? 0);
  const absentDed = Number(slip?.deductions?.absent_deductions ?? payroll.absent_deductions ?? 0);
  const otherDed = Number(slip?.deductions?.other_deductions ?? payroll.deductions ?? 0);
  const totalDed = sss + philhealth + pagibig + tax + lateDed + absentDed + otherDed;

  return (
    <section className="my-payslip-print-area">
      <h1>{STORE_INFO.name}</h1>
      <p>{STORE_INFO.address}</p>
      <h2>Employee Payslip</h2>
      <p>Generated: {formatDateTime(new Date())}</p>

      <div className="print-info-grid">
        <div><strong>Employee</strong><span>{payroll.user?.name || payroll.employee_name || "N/A"}</span></div>
        <div><strong>Payroll ID</strong><span>{payroll.payroll_id || "N/A"}</span></div>
        <div><strong>Department</strong><span>{payroll.department || "N/A"}</span></div>
        <div><strong>Position</strong><span>{payroll.position || payroll.role || "N/A"}</span></div>
        <div><strong>Pay Period</strong><span>{payroll.pay_period_label || "N/A"}</span></div>
        <div><strong>Status</strong><span>{formatLabel(payroll.status)}</span></div>
      </div>

      <table>
        <thead><tr><th>Earnings</th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>{periodFactorFor(payroll, slip) === 0.5 ? "Base Salary (half-month cutoff)" : "Base Salary"}</td>
            <td>{formatCurrency(periodBaseSalary(payroll, slip))}</td>
          </tr>
          <tr><td>Overtime Pay</td><td>{formatCurrency(payroll.overtime_pay)}</td></tr>
          <tr><td>Bonus</td><td>{formatCurrency(payroll.bonus)}</td></tr>
          <tr><td>Allowances</td><td>{formatCurrency(payroll.allowances)}</td></tr>
          <tr className="net-row"><td>Gross Pay</td><td>{formatCurrency(payroll.gross_pay)}</td></tr>
        </tbody>
      </table>

      <table>
        <thead><tr><th>Deductions</th><th>Amount</th></tr></thead>
        <tbody>
          <tr><td>SSS Contribution</td><td>{formatCurrency(sss)}</td></tr>
          <tr><td>PhilHealth Contribution</td><td>{formatCurrency(philhealth)}</td></tr>
          <tr><td>Pag-IBIG Contribution</td><td>{formatCurrency(pagibig)}</td></tr>
          <tr><td>Withholding Tax</td><td>{formatCurrency(tax)}</td></tr>
          <tr><td>Late Deductions</td><td>{formatCurrency(lateDed)}</td></tr>
          <tr><td>Absence Deductions</td><td>{formatCurrency(absentDed)}</td></tr>
          {paidLeaveDaysOf(payroll, slip) > 0 && (
            <tr><td>Paid Leave Days (converted, not deducted)</td><td>{paidLeaveDaysOf(payroll, slip)} day(s)</td></tr>
          )}
          <tr><td>Other Deductions</td><td>{formatCurrency(otherDed)}</td></tr>
          <tr className="net-row"><td>Total Deductions</td><td>{formatCurrency(totalDed)}</td></tr>
        </tbody>
      </table>

      <div className="print-net">
        <strong>Net Pay: {formatCurrency(payroll.net_pay)}</strong>
      </div>

      <div className="print-signatures">
        <div><span></span><strong>Prepared By</strong></div>
        <div><span></span><strong>Employee Signature</strong></div>
      </div>
    </section>
  );
};

export default MyPayroll;
