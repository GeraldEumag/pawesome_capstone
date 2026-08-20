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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
    const doc = new jsPDF();
    const accent = roleAccent;

    // Header
    doc.setFontSize(18);
    doc.setTextColor(accent);
    doc.text(STORE_INFO.name, 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(STORE_INFO.address, 14, 26);
    doc.text(STORE_INFO.phone, 14, 31);

    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Employee Payslip", 14, 42);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${formatDateTime(new Date())}`, 14, 48);

    // Employee info
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    const empName = payroll.user?.name || payroll.employee_name || payroll.employeeName || "N/A";
    const empDept = payroll.department || "N/A";
    const empRole = payroll.position || payroll.role || "N/A";
    const payPeriod = payroll.pay_period_label || payroll.pay_period || payroll.period || "N/A";
    const payrollId = payroll.payroll_id || payroll.payrollId || "N/A";
    const status = formatLabel(payroll.status);

    doc.text(`Employee: ${empName}`, 14, 58);
    doc.text(`Payroll ID: ${payrollId}`, 14, 64);
    doc.text(`Pay Period: ${payPeriod}`, 14, 70);
    doc.text(`Department: ${empDept}`, 14, 76);
    doc.text(`Position: ${empRole}`, 14, 82);
    doc.text(`Status: ${status}`, 14, 88);

    // Earnings table
    const baseSalary = Number(slip?.earnings?.base_salary ?? payroll.base_salary ?? payroll.baseSalary ?? 0);
    const otPay = Number(slip?.earnings?.overtime_pay ?? payroll.overtime_pay ?? payroll.overtimePay ?? 0);
    const bonus = Number(slip?.earnings?.bonus ?? payroll.bonus ?? 0);
    const allowances = Number(slip?.earnings?.allowances ?? payroll.allowances ?? payroll.allowance ?? 0);
    const grossPay = Number(slip?.earnings?.gross_pay ?? payroll.gross_pay ?? payroll.grossPay ?? 0);

    autoTable(doc, {
      startY: 98,
      head: [["Earnings", "Amount"]],
      body: [
        ["Base Salary", formatCurrency(baseSalary)],
        ["Overtime Pay", formatCurrency(otPay)],
        ["Bonus", formatCurrency(bonus)],
        ["Allowances", formatCurrency(allowances)],
        ["Gross Pay", formatCurrency(grossPay)],
      ],
      headStyles: { fillColor: [accent ? parseInt(accent.slice(1, 3), 16) : 8, accent ? parseInt(accent.slice(3, 5), 16) : 145, accent ? parseInt(accent.slice(5, 7), 16) : 178], textColor: 255, fontStyle: "bold" },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    });

    // Deductions table
    const sss = Number(slip?.deductions?.sss ?? payroll.sss_contribution ?? 0);
    const philhealth = Number(slip?.deductions?.philhealth ?? payroll.philhealth_contribution ?? 0);
    const pagibig = Number(slip?.deductions?.pagibig ?? payroll.pagibig_contribution ?? 0);
    const tax = Number(slip?.deductions?.tax ?? payroll.tax_deduction ?? 0);
    const lateDed = Number(slip?.deductions?.late_deductions ?? payroll.late_deductions ?? payroll.lateDeductions ?? 0);
    const absentDed = Number(slip?.deductions?.absent_deductions ?? payroll.absent_deductions ?? payroll.absenceDeductions ?? 0);
    const otherDed = Number(slip?.deductions?.other_deductions ?? payroll.deductions ?? 0);
    const totalDed = sss + philhealth + pagibig + tax + lateDed + absentDed + otherDed;

    const afterEarningsY = doc.lastAutoTable.finalY + 8;

    autoTable(doc, {
      startY: afterEarningsY,
      head: [["Deductions", "Amount"]],
      body: [
        ["SSS Contribution", formatCurrency(sss)],
        ["PhilHealth Contribution", formatCurrency(philhealth)],
        ["Pag-IBIG Contribution", formatCurrency(pagibig)],
        ["Withholding Tax", formatCurrency(tax)],
        ["Late Deductions", formatCurrency(lateDed)],
        ["Absence Deductions", formatCurrency(absentDed)],
        ["Other Deductions", formatCurrency(otherDed)],
        ["Total Deductions", formatCurrency(totalDed)],
      ],
      headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: "bold" },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    });

    // Net pay
    const netPay = Number(slip?.net_pay ?? payroll.net_pay ?? payroll.netPay ?? 0);
    const afterDedY = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(14);
    doc.setTextColor(accent);
    doc.text(`Net Pay: ${formatCurrency(netPay)}`, 14, afterDedY);

    // Attendance summary
    const afterNetY = afterDedY + 10;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const presentDays = slip?.attendance?.present_days ?? payroll.present_days ?? "N/A";
    const absentDays = slip?.attendance?.absent_days ?? payroll.absent_days ?? "N/A";
    const regHours = slip?.attendance?.regular_hours ?? payroll.regular_hours ?? payroll.regularHours ?? "N/A";
    const otHours = slip?.attendance?.overtime_hours ?? payroll.overtime_hours ?? payroll.overtimeHours ?? "N/A";
    doc.text(`Attendance: ${presentDays} present, ${absentDays} absent | ${regHours} regular hrs, ${otHours} OT hrs`, 14, afterNetY);

    // Payment info
    const payDate = slip?.payment_date || payroll.payment_date || "N/A";
    const payMethod = slip?.payment_method || payroll.payment_method || "N/A";
    doc.text(`Payment Date: ${formatDate(payDate)} | Method: ${payMethod}`, 14, afterNetY + 6);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("This payslip was generated by the Pawesome Payroll Management System.", 14, afterNetY + 16);
    doc.text("Signatures: __________________ (Prepared By)   __________________ (Employee)", 14, afterNetY + 22);

    const filename = `Payslip-${empName.replace(/\s+/g, "_")}-${String(payPeriod).replace(/\s+/g, "_")}.pdf`;
    doc.save(filename);
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
          <tr><td>Base Salary</td><td>{formatCurrency(payroll.base_salary)}</td></tr>
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
          <tr><td>Base Salary</td><td>{formatCurrency(payroll.base_salary)}</td></tr>
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
