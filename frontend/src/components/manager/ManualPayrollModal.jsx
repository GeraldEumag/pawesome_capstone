import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalculator,
  faCheckCircle,
  faClipboardList,
  faExclamationTriangle,
  faFileInvoiceDollar,
  faMinus,
  faPen,
  faPlus,
  faSave,
  faSpinner,
  faStamp,
  faUser,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { payrollApi } from "../../api/payroll";
import { useAuth } from "../../context/AuthContext";
import { formatCurrency } from "../../utils/currency";
import "./ManualPayrollModal.css";

const toNum = (v) => (v === "" || v == null ? 0 : Number(v));

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const monthStartInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const NumberInput = ({ label, value, onChange, min = 0, step = 0.01, prefix = "", disabled = false }) => (
  <label className="mpm-field">
    <span>{label}</span>
    <div className="mpm-number-wrap">
      {prefix && <small>{prefix}</small>}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  </label>
);

const SelectInput = ({ label, value, onChange, options, disabled = false }) => (
  <label className="mpm-field">
    <span>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </label>
);

const DateInput = ({ label, value, onChange, disabled = false }) => (
  <label className="mpm-field">
    <span>{label}</span>
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
  </label>
);

const TextInput = ({ label, value, onChange, placeholder = "", disabled = false }) => (
  <label className="mpm-field">
    <span>{label}</span>
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
  </label>
);

const emptyAttendanceRow = () => ({
  date: "",
  time_in: "",
  time_out: "",
  regular_hours: "",
  overtime_hours: "",
  late_minutes: "",
  undertime_hours: "",
  remarks: "",
});

const STATUS_LABELS = {
  draft: "Draft",
  processing: "Processing",
  pending: "Pending Approval",
  approved: "Approved",
  paid: "Paid",
  cancelled: "Cancelled",
};

const ManualPayrollModal = ({ onClose, onSaved, initialPayroll }) => {
  const { user } = useAuth();
  const preparedByName = user?.name || "Manager";

  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isEditMode = !!initialPayroll;
  const [payrollRecord, setPayrollRecord] = useState(initialPayroll || null);
  const currentStatus = payrollRecord?.status || "draft";
  const isReadonly = ["paid", "cancelled"].includes(currentStatus);

  // Section 1 — Payroll Information
  const [userId, setUserId] = useState(initialPayroll?.user_id || "");
  const [employeeName, setEmployeeName] = useState(initialPayroll?.employee_name || "");
  const [useManualName, setUseManualName] = useState(!initialPayroll?.user_id && !!initialPayroll?.employee_name);
  const [periodStart, setPeriodStart] = useState(initialPayroll?.pay_period_start || monthStartInput());
  const [periodEnd, setPeriodEnd] = useState(initialPayroll?.pay_period_end || todayInput());
  const [payDate, setPayDate] = useState(initialPayroll?.payment_date || "");
  const [department, setDepartment] = useState(initialPayroll?.department || "");

  // Section 2 — Employee Information
  const [employmentType, setEmploymentType] = useState(initialPayroll?.employment_type || "regular");
  const [rateType, setRateType] = useState(initialPayroll?.rate_type || "monthly");

  // Section 3 — Attendance rows
  const [attendanceRows, setAttendanceRows] = useState(
    initialPayroll?.manual_attendance || [emptyAttendanceRow()]
  );

  // Section 4 — Earnings
  const [baseSalary, setBaseSalary] = useState(initialPayroll?.base_salary || 15000);
  const [hourlyRate, setHourlyRate] = useState(initialPayroll?.hourly_rate || "");
  const [workingDays, setWorkingDays] = useState(initialPayroll?.working_days || 22);
  const [presentDays, setPresentDays] = useState(initialPayroll?.present_days || 22);
  const [absentDays, setAbsentDays] = useState(initialPayroll?.absent_days || 0);
  const [regularHours, setRegularHours] = useState(initialPayroll?.regular_hours || 176);
  const [overtimeHours, setOvertimeHours] = useState(initialPayroll?.overtime_hours || 0);
  const [overtimePay, setOvertimePay] = useState(initialPayroll?.overtime_pay || 0);
  const [regularHolidayPay, setRegularHolidayPay] = useState(initialPayroll?.regular_holiday_pay || 0);
  const [specialHolidayPay, setSpecialHolidayPay] = useState(initialPayroll?.special_holiday_pay || 0);
  const [nightDifferential, setNightDifferential] = useState(initialPayroll?.night_differential || 0);
  const [regularHolidayOtPay, setRegularHolidayOtPay] = useState(initialPayroll?.regular_holiday_ot_pay || 0);
  const [specialHolidayOtPay, setSpecialHolidayOtPay] = useState(initialPayroll?.special_holiday_ot_pay || 0);
  const [bonus, setBonus] = useState(initialPayroll?.bonus || 0);
  const [allowances, setAllowances] = useState(initialPayroll?.allowances || 0);
  const [commission, setCommission] = useState(initialPayroll?.commission || 0);
  const [otherEarnings, setOtherEarnings] = useState(initialPayroll?.other_earnings || 0);

  // Section 5 — Deductions
  const [sss, setSss] = useState(initialPayroll?.sss_contribution || 0);
  const [philhealth, setPhilhealth] = useState(initialPayroll?.philhealth_contribution || 0);
  const [pagibig, setPagibig] = useState(initialPayroll?.pagibig_contribution || 100);
  const [tax, setTax] = useState(initialPayroll?.tax_deduction || 0);
  const [lateDeductions, setLateDeductions] = useState(initialPayroll?.late_deductions || 0);
  const [absentDeductions, setAbsentDeductions] = useState(initialPayroll?.absent_deductions || 0);
  const [otherDeductions, setOtherDeductions] = useState(initialPayroll?.deductions || 0);
  const [salaryLoan, setSalaryLoan] = useState(initialPayroll?.salary_loan || 0);
  const [cashAdvance, setCashAdvance] = useState(initialPayroll?.cash_advance || 0);
  const [remarks, setRemarks] = useState(initialPayroll?.remarks || "");

  // Section 7 — Payment Information
  const [paymentDate, setPaymentDate] = useState(initialPayroll?.payment_date || "");
  const [paymentMethod, setPaymentMethod] = useState(initialPayroll?.payment_method || "cash");
  const [paymentReference, setPaymentReference] = useState(initialPayroll?.payment_reference || "");

  // Section 8 — Approval
  const [employeeConfirmed, setEmployeeConfirmed] = useState(false);
  const [employeeConfirmDate, setEmployeeConfirmDate] = useState("");
  const [managerApproved, setManagerApproved] = useState(currentStatus === "approved" || currentStatus === "paid");
  const [managerApproveDate, setManagerApproveDate] = useState(initialPayroll?.approved_at || "");

  // Section 9 — Payroll Summary
  const [summaryRecords, setSummaryRecords] = useState([]);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    setLoadingEmployees(true);
    apiRequest("/manager/staff")
      .then((res) => {
        const list = res?.staff || res?.data?.staff || [];
        setEmployees(list);
        if (list.length > 0 && !userId) setUserId(String(list[0].id));
      })
      .catch(() => setError("Could not load employees."))
      .finally(() => setLoadingEmployees(false));
  }, []);

  useEffect(() => {
    if (baseSalary && !hourlyRate) {
      setHourlyRate(Number((baseSalary / 160).toFixed(2)));
    }
  }, [baseSalary, hourlyRate]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => String(e.id) === String(userId)),
    [employees, userId]
  );

  // Display name: from selected employee, manual entry, or payroll record
  const displayName = useManualName
    ? employeeName
    : (selectedEmployee?.name || payrollRecord?.employee_name || "");

  // Auto-fill department from employee (only when selecting from list)
  useEffect(() => {
    if (selectedEmployee && !useManualName && !department) {
      setDepartment(selectedEmployee.department || "Unassigned");
    }
  }, [selectedEmployee, department, useManualName]);

  // Attendance row helpers
  const addAttendanceRow = () => {
    if (isReadonly) return;
    setAttendanceRows((prev) => [...prev, emptyAttendanceRow()]);
  };

  const removeAttendanceRow = (index) => {
    if (isReadonly) return;
    setAttendanceRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAttendanceRow = (index, field, value) => {
    if (isReadonly) return;
    setAttendanceRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  // Auto-sum attendance hours
  const attendanceTotals = useMemo(() => {
    return attendanceRows.reduce(
      (acc, row) => ({
        regularHours: acc.regularHours + toNum(row.regular_hours),
        overtimeHours: acc.overtimeHours + toNum(row.overtime_hours),
        lateMinutes: acc.lateMinutes + toNum(row.late_minutes),
        undertimeHours: acc.undertimeHours + toNum(row.undertime_hours),
      }),
      { regularHours: 0, overtimeHours: 0, lateMinutes: 0, undertimeHours: 0 }
    );
  }, [attendanceRows]);

  // Sync attendance totals to earnings fields
  useEffect(() => {
    if (attendanceRows.length > 0 && !isReadonly) {
      setRegularHours(Number(attendanceTotals.regularHours.toFixed(2)));
      setOvertimeHours(Number(attendanceTotals.overtimeHours.toFixed(2)));
    }
  }, [attendanceTotals, attendanceRows.length, isReadonly]);

  // Computed totals
  const computed = useMemo(() => {
    const bs = toNum(baseSalary);
    const hr = toNum(hourlyRate);
    const otHrs = toNum(overtimeHours);
    const otPay = toNum(overtimePay);
    const bon = toNum(bonus);
    const allw = toNum(allowances);
    const comm = toNum(commission);
    const otherEarn = toNum(otherEarnings);

    const rhPay = toNum(regularHolidayPay);
    const shPay = toNum(specialHolidayPay);
    const nd = toNum(nightDifferential);
    const rhOt = toNum(regularHolidayOtPay);
    const shOt = toNum(specialHolidayOtPay);

    const sssVal = toNum(sss);
    const phil = toNum(philhealth);
    const pag = toNum(pagibig);
    const tx = toNum(tax);
    const late = toNum(lateDeductions);
    const absent = toNum(absentDeductions);
    const other = toNum(otherDeductions);
    const loan = toNum(salaryLoan);
    const advance = toNum(cashAdvance);

    const derivedOtPay = otPay || (otHrs * hr * 1.5);
    const gross = bs + derivedOtPay + rhPay + shPay + nd + rhOt + shOt + bon + allw + comm + otherEarn;
    const totalDed = sssVal + phil + pag + tx + late + absent + other + loan + advance;
    const net = Math.max(0, gross - totalDed);

    return { gross, totalDed, net, derivedOtPay };
  }, [
    baseSalary, hourlyRate, overtimeHours, overtimePay, regularHolidayPay, specialHolidayPay,
    nightDifferential, regularHolidayOtPay, specialHolidayOtPay, bonus, allowances, commission,
    otherEarnings, sss, philhealth, pagibig, tax, lateDeductions, absentDeductions, otherDeductions,
    salaryLoan, cashAdvance,
  ]);

  // Build payload
  const buildPayload = useCallback(
    (statusOverride) => {
      const status = statusOverride || currentStatus;
      return {
        user_id: useManualName ? null : (userId ? Number(userId) : null),
        employee_name: useManualName ? employeeName : (selectedEmployee?.name || null),
        pay_period_start: periodStart,
        pay_period_end: periodEnd,
        employment_type: employmentType,
        rate_type: rateType,
        base_salary: toNum(baseSalary),
        hourly_rate: toNum(hourlyRate),
        working_days: toNum(workingDays),
        present_days: toNum(presentDays),
        absent_days: toNum(absentDays),
        regular_hours: toNum(regularHours),
        overtime_hours: toNum(overtimeHours),
        overtime_pay: computed.derivedOtPay,
        regular_holiday_pay: toNum(regularHolidayPay),
        special_holiday_pay: toNum(specialHolidayPay),
        night_differential: toNum(nightDifferential),
        regular_holiday_ot_pay: toNum(regularHolidayOtPay),
        special_holiday_ot_pay: toNum(specialHolidayOtPay),
        bonus: toNum(bonus),
        allowances: toNum(allowances),
        commission: toNum(commission),
        other_earnings: toNum(otherEarnings),
        deductions: toNum(otherDeductions),
        tax_deduction: toNum(tax),
        sss_contribution: toNum(sss),
        philhealth_contribution: toNum(philhealth),
        pagibig_contribution: toNum(pagibig),
        late_deductions: toNum(lateDeductions),
        absent_deductions: toNum(absentDeductions),
        salary_loan: toNum(salaryLoan),
        cash_advance: toNum(cashAdvance),
        gross_pay: computed.gross,
        net_pay: computed.net,
        payment_date: paymentDate || null,
        payment_method: paymentMethod || null,
        payment_reference: paymentReference || null,
        remarks: remarks || "",
        manual_attendance: attendanceRows,
        status,
      };
    },
    [userId, periodStart, periodEnd, employmentType, rateType, baseSalary, hourlyRate, workingDays,
      presentDays, absentDays, regularHours, overtimeHours, computed, regularHolidayPay,
      specialHolidayPay, nightDifferential, regularHolidayOtPay, specialHolidayOtPay, bonus,
      allowances, commission, otherEarnings, otherDeductions, tax, sss, philhealth, pagibig,
      lateDeductions, absentDeductions, salaryLoan, cashAdvance, paymentDate, paymentMethod,
      paymentReference, remarks, attendanceRows, currentStatus, useManualName, employeeName,
      selectedEmployee]
  );

  const handleSave = useCallback(
    async (statusOverride) => {
      if (useManualName) {
        if (!employeeName || !employeeName.trim()) { setError("Please enter an employee name."); return; }
      } else {
        if (!userId) { setError("Please select an employee."); return; }
      }
      if (!periodStart || !periodEnd) { setError("Please select a pay period."); return; }

      setSaving(true);
      setError("");
      setSuccessMsg("");
      try {
        const payload = buildPayload(statusOverride);
        let result;

        if (isEditMode && payrollRecord?.id) {
          result = await payrollApi.update(payrollRecord.id, payload);
        } else {
          result = await payrollApi.create(payload);
        }

        const newRecord = result?.data || result?.payroll || result;
        if (newRecord) {
          setPayrollRecord(newRecord);
        }

        setSuccessMsg(`Payroll ${statusOverride ? STATUS_LABELS[statusOverride] : "saved"} successfully.`);
        onSaved?.();
        return newRecord;
      } catch (err) {
        setError(err.message || "Failed to save payroll.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [isEditMode, payrollRecord, buildPayload, onSaved]
  );

  const handleSaveDraft = () => handleSave("draft");

  const handleSubmitForApproval = async () => {
    const record = await handleSave("pending");
    if (record) setPayrollRecord(record);
  };

  const handleApprove = async () => {
    if (!payrollRecord?.id) {
      setError("Please save the payroll first before approving.");
      return;
    }
    setManagerApproved(true);
    setManagerApproveDate(todayInput());
    const record = await handleSave("approved");
    if (record) setPayrollRecord(record);
  };

  const handleMarkAsPaid = async () => {
    if (!paymentDate) {
      setError("Please enter a Payment Date before marking as paid.");
      return;
    }
    const record = await handleSave("paid");
    if (record) setPayrollRecord(record);
  };

  const loadSummary = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    try {
      const res = await payrollApi.getByPeriod(periodStart, periodEnd);
      const list = res?.data || res?.payrolls || [];
      setSummaryRecords(Array.isArray(list) ? list : []);
      setShowSummary(true);
    } catch {
      setSummaryRecords([]);
      setShowSummary(true);
    }
  }, [periodStart, periodEnd]);

  const canEdit = !isReadonly;
  const canApprove = canEdit && currentStatus === "pending";
  const canMarkPaid = canEdit && (currentStatus === "approved" || currentStatus === "pending");

  return (
    <div className="mpm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mpm-dialog">
        {/* Header */}
        <div className="mpm-header">
          <div>
            <span className="mpm-eyebrow">Manual Payroll</span>
            <h2>{isEditMode ? "Edit Payroll" : "Compute Payroll Manually"}</h2>
            {payrollRecord?.payroll_id && (
              <small className="mpm-payroll-id">ID: {payrollRecord.payroll_id}</small>
            )}
          </div>
          <div className="mpm-header-right">
            <span className={`mpm-status-badge mpm-status-${currentStatus}`}>
              {STATUS_LABELS[currentStatus] || "Draft"}
            </span>
            <button type="button" className="mpm-close" onClick={onClose}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mpm-alert error">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mpm-alert success">
            <FontAwesomeIcon icon={faCheckCircle} />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="mpm-body">
          {/* Section 1 — Payroll Information */}
          <section className="mpm-section">
            <div className="mpm-section-header">
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
              <h3>Payroll Information</h3>
            </div>
            <div className="mpm-row top">
              <div className="mpm-field employee">
                <span>Employee</span>
                <div className="mpm-employee-toggle">
                  <button
                    type="button"
                    className={`mpm-toggle-btn ${!useManualName ? "active" : ""}`}
                    onClick={() => setUseManualName(false)}
                    disabled={isReadonly}
                  >
                    Select from List
                  </button>
                  <button
                    type="button"
                    className={`mpm-toggle-btn ${useManualName ? "active" : ""}`}
                    onClick={() => { setUseManualName(true); setUserId(""); }}
                    disabled={isReadonly}
                  >
                    Enter Name Manually
                  </button>
                </div>
                {!useManualName ? (
                  <div className="mpm-select-wrap">
                    <FontAwesomeIcon icon={faUser} />
                    <select
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      disabled={loadingEmployees || isReadonly}
                    >
                      {loadingEmployees && <option>Loading...</option>}
                      {!loadingEmployees && employees.length === 0 && <option value="">No employees found</option>}
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Enter employee name (e.g. Juan Dela Cruz)"
                    disabled={isReadonly}
                  />
                )}
              </div>
              <DateInput label="Period Start" value={periodStart} onChange={setPeriodStart} disabled={isReadonly} />
              <DateInput label="Period End" value={periodEnd} onChange={setPeriodEnd} disabled={isReadonly} />
              <DateInput label="Pay Date" value={payDate} onChange={setPayDate} disabled={isReadonly} />
              <TextInput label="Department" value={department} onChange={setDepartment} disabled={isReadonly} />
            </div>
            <div className="mpm-info-row">
              <small><strong>Prepared By:</strong> {preparedByName}</small>
              <small><strong>Approved By:</strong> {payrollRecord?.approver?.name || (managerApproved ? preparedByName : "—")}</small>
              <small><strong>Date Approved:</strong> {managerApproveDate || "—"}</small>
            </div>
          </section>

          {/* Section 2 — Employee Information */}
          {(selectedEmployee || (useManualName && employeeName)) && (
            <section className="mpm-section">
              <div className="mpm-section-header">
                <FontAwesomeIcon icon={faUser} />
                <h3>Employee Information</h3>
              </div>
              <div className="mpm-employee-card">
                <div>
                  <strong>{displayName}</strong>
                  <small>
                    {selectedEmployee
                      ? `ID: ${selectedEmployee.id} · ${selectedEmployee.position || selectedEmployee.role || "Staff"}`
                      : "Manual entry (no account)"}
                  </small>
                </div>
              </div>
              <div className="mpm-grid-3">
                <SelectInput
                  label="Employment Type"
                  value={employmentType}
                  onChange={setEmploymentType}
                  disabled={isReadonly}
                  options={[
                    { value: "regular", label: "Regular" },
                    { value: "part_time", label: "Part-time" },
                    { value: "contractual", label: "Contractual" },
                  ]}
                />
                <SelectInput
                  label="Rate Type"
                  value={rateType}
                  onChange={setRateType}
                  disabled={isReadonly}
                  options={[
                    { value: "monthly", label: "Monthly" },
                    { value: "daily", label: "Daily" },
                    { value: "hourly", label: "Hourly" },
                  ]}
                />
                <NumberInput label="Basic Rate" value={baseSalary} onChange={setBaseSalary} prefix="₱" disabled={isReadonly} />
              </div>
            </section>
          )}

          {/* Section 3 — Attendance / Work Details */}
          <section className="mpm-section">
            <div className="mpm-section-header">
              <FontAwesomeIcon icon={faClipboardList} />
              <h3>Attendance / Work Details</h3>
              {canEdit && (
                <button type="button" className="mpm-add-row-btn" onClick={addAttendanceRow}>
                  <FontAwesomeIcon icon={faPlus} /> Add Row
                </button>
              )}
            </div>
            <div className="mpm-table-scroll">
              <table className="mpm-attendance-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time In</th>
                    <th>Time Out</th>
                    <th>Reg. Hrs</th>
                    <th>OT Hrs</th>
                    <th>Late (min)</th>
                    <th>Undertime</th>
                    <th>Remarks</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row, index) => (
                    <tr key={index}>
                      <td><input type="date" value={row.date} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "date", e.target.value)} /></td>
                      <td><input type="time" value={row.time_in} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "time_in", e.target.value)} /></td>
                      <td><input type="time" value={row.time_out} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "time_out", e.target.value)} /></td>
                      <td><input type="number" step="0.01" min="0" value={row.regular_hours} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "regular_hours", e.target.value)} /></td>
                      <td><input type="number" step="0.01" min="0" value={row.overtime_hours} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "overtime_hours", e.target.value)} /></td>
                      <td><input type="number" step="1" min="0" value={row.late_minutes} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "late_minutes", e.target.value)} /></td>
                      <td><input type="number" step="0.01" min="0" value={row.undertime_hours} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "undertime_hours", e.target.value)} /></td>
                      <td><input type="text" value={row.remarks} disabled={isReadonly} onChange={(e) => updateAttendanceRow(index, "remarks", e.target.value)} /></td>
                      {canEdit && (
                        <td>
                          <button type="button" className="mpm-remove-row" onClick={() => removeAttendanceRow(index)}>
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="mpm-attendance-totals">
                    <td colSpan={3}><strong>Totals</strong></td>
                    <td><strong>{attendanceTotals.regularHours.toFixed(2)}</strong></td>
                    <td><strong>{attendanceTotals.overtimeHours.toFixed(2)}</strong></td>
                    <td><strong>{attendanceTotals.lateMinutes}</strong></td>
                    <td><strong>{attendanceTotals.undertimeHours.toFixed(2)}</strong></td>
                    <td colSpan={canEdit ? 2 : 1}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Section 4 & 5 — Earnings and Deductions */}
          <div className="mpm-grid">
            {/* Earnings Column */}
            <div className="mpm-col">
              <div className="mpm-col-header">
                <FontAwesomeIcon icon={faPlus} />
                <h3>Earnings</h3>
              </div>
              <div className="mpm-fields">
                <NumberInput label="Base Salary" value={baseSalary} onChange={setBaseSalary} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Hourly Rate" value={hourlyRate} onChange={setHourlyRate} prefix="₱" disabled={isReadonly} />
                <div className="mpm-row-inner">
                  <NumberInput label="Working Days" value={workingDays} onChange={setWorkingDays} step={1} disabled={isReadonly} />
                  <NumberInput label="Present Days" value={presentDays} onChange={setPresentDays} step={1} disabled={isReadonly} />
                  <NumberInput label="Absent Days" value={absentDays} onChange={setAbsentDays} step={1} disabled={isReadonly} />
                </div>
                <div className="mpm-row-inner">
                  <NumberInput label="Regular Hours" value={regularHours} onChange={setRegularHours} disabled={isReadonly} />
                  <NumberInput label="Overtime Hours" value={overtimeHours} onChange={setOvertimeHours} disabled={isReadonly} />
                </div>
                <NumberInput label="Overtime Pay" value={overtimePay} onChange={setOvertimePay} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Regular Holiday Pay" value={regularHolidayPay} onChange={setRegularHolidayPay} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Special Holiday Pay" value={specialHolidayPay} onChange={setSpecialHolidayPay} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Night Differential" value={nightDifferential} onChange={setNightDifferential} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Reg. Holiday OT Pay" value={regularHolidayOtPay} onChange={setRegularHolidayOtPay} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Spl. Holiday OT Pay" value={specialHolidayOtPay} onChange={setSpecialHolidayOtPay} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Bonus" value={bonus} onChange={setBonus} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Allowances" value={allowances} onChange={setAllowances} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Commission / Incentive" value={commission} onChange={setCommission} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Other Earnings" value={otherEarnings} onChange={setOtherEarnings} prefix="₱" disabled={isReadonly} />
              </div>
            </div>

            {/* Deductions Column */}
            <div className="mpm-col">
              <div className="mpm-col-header">
                <FontAwesomeIcon icon={faMinus} />
                <h3>Deductions</h3>
              </div>
              <div className="mpm-fields">
                <NumberInput label="SSS Contribution" value={sss} onChange={setSss} prefix="₱" disabled={isReadonly} />
                <NumberInput label="PhilHealth Contribution" value={philhealth} onChange={setPhilhealth} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Pag-IBIG Contribution" value={pagibig} onChange={setPagibig} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Withholding Tax" value={tax} onChange={setTax} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Salary Loan" value={salaryLoan} onChange={setSalaryLoan} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Cash Advance" value={cashAdvance} onChange={setCashAdvance} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Late Deductions" value={lateDeductions} onChange={setLateDeductions} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Absent Deductions" value={absentDeductions} onChange={setAbsentDeductions} prefix="₱" disabled={isReadonly} />
                <NumberInput label="Other Deductions" value={otherDeductions} onChange={setOtherDeductions} prefix="₱" disabled={isReadonly} />
              </div>
            </div>
          </div>

          {/* Section 6 — Net Pay Calculation */}
          <div className="mpm-totals">
            <div className="mpm-total-card">
              <small>Gross Pay</small>
              <strong>{formatCurrency(computed.gross)}</strong>
            </div>
            <div className="mpm-total-card">
              <small>Total Deductions</small>
              <strong className="ded">{formatCurrency(computed.totalDed)}</strong>
            </div>
            <div className="mpm-total-card net">
              <small>Net Pay</small>
              <strong>{formatCurrency(computed.net)}</strong>
            </div>
          </div>

          {/* Section 7 — Payment Information */}
          <section className="mpm-section">
            <div className="mpm-section-header">
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
              <h3>Payment Information</h3>
            </div>
            <div className="mpm-grid-3">
              <DateInput label="Payment Date" value={paymentDate} onChange={setPaymentDate} disabled={isReadonly} />
              <SelectInput
                label="Payment Method"
                value={paymentMethod}
                onChange={setPaymentMethod}
                disabled={isReadonly}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "bank_transfer", label: "Bank Transfer" },
                  { value: "gcash", label: "GCash" },
                  { value: "other", label: "Other" },
                ]}
              />
              <TextInput label="Payment Reference No." value={paymentReference} onChange={setPaymentReference} disabled={isReadonly} />
            </div>
            <div className="mpm-info-row">
              <small><strong>Payment Status:</strong> {currentStatus === "paid" ? "Paid" : "Unpaid"}</small>
            </div>
          </section>

          {/* Section 8 — Signature / Approval */}
          <section className="mpm-section">
            <div className="mpm-section-header">
              <FontAwesomeIcon icon={faStamp} />
              <h3>Signature / Approval</h3>
            </div>
            <div className="mpm-approval-grid">
              <label className="mpm-approval-item">
                <span>Employee Confirmation</span>
                <div className="mpm-approval-check">
                  <input
                    type="checkbox"
                    checked={employeeConfirmed}
                    disabled={isReadonly}
                    onChange={(e) => {
                      setEmployeeConfirmed(e.target.checked);
                      setEmployeeConfirmDate(e.target.checked ? todayInput() : "");
                    }}
                  />
                  <small>{employeeConfirmed ? `Confirmed on ${employeeConfirmDate}` : "Not confirmed"}</small>
                </div>
              </label>
              <div className="mpm-approval-item">
                <span>Payroll Officer</span>
                <strong>{preparedByName}</strong>
              </div>
              <label className="mpm-approval-item">
                <span>Manager Approval</span>
                <div className="mpm-approval-check">
                  <input
                    type="checkbox"
                    checked={managerApproved}
                    disabled={isReadonly || !canApprove}
                    onChange={(e) => {
                      setManagerApproved(e.target.checked);
                      setManagerApproveDate(e.target.checked ? todayInput() : "");
                    }}
                  />
                  <small>{managerApproved ? `Approved on ${managerApproveDate}` : "Pending approval"}</small>
                </div>
              </label>
            </div>
          </section>

          {/* Section 9 — Payroll Summary */}
          <section className="mpm-section">
            <div className="mpm-section-header">
              <FontAwesomeIcon icon={faUsers} />
              <h3>Payroll Summary (Period)</h3>
              <button type="button" className="mpm-add-row-btn" onClick={loadSummary} disabled={!periodStart || !periodEnd}>
                Load Summary
              </button>
            </div>
            {showSummary && (
              <div className="mpm-table-scroll">
                <table className="mpm-summary-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Position</th>
                      <th>Basic Pay</th>
                      <th>Overtime</th>
                      <th>Other Earnings</th>
                      <th>Gross Pay</th>
                      <th>Total Deductions</th>
                      <th>Net Pay</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRecords.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="mpm-empty">No payroll records for this period.</td>
                      </tr>
                    ) : (
                      summaryRecords.map((rec, i) => {
                        const totalDed = toNum(rec.sss_contribution) + toNum(rec.philhealth_contribution) +
                          toNum(rec.pagibig_contribution) + toNum(rec.tax_deduction) + toNum(rec.late_deductions) +
                          toNum(rec.absent_deductions) + toNum(rec.deductions) + toNum(rec.salary_loan) +
                          toNum(rec.cash_advance);
                        return (
                          <tr key={rec.id || i}>
                            <td>{rec.user?.name || "Unknown"}</td>
                            <td>{rec.position || rec.user?.role || "Staff"}</td>
                            <td>{formatCurrency(toNum(rec.base_salary))}</td>
                            <td>{formatCurrency(toNum(rec.overtime_pay))}</td>
                            <td>{formatCurrency(toNum(rec.bonus) + toNum(rec.allowances) + toNum(rec.commission) + toNum(rec.other_earnings))}</td>
                            <td>{formatCurrency(toNum(rec.gross_pay))}</td>
                            <td>{formatCurrency(totalDed)}</td>
                            <td><strong>{formatCurrency(toNum(rec.net_pay))}</strong></td>
                            <td><span className={`mpm-status-badge mpm-status-${rec.status}`}>{STATUS_LABELS[rec.status] || rec.status}</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <label className="mpm-field remarks">
            <span>Remarks</span>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes..." disabled={isReadonly} />
          </label>
        </div>

        {/* Section 10 — Workflow Buttons */}
        <div className="mpm-footer">
          <button type="button" className="mpm-btn secondary" onClick={onClose}>
            Cancel
          </button>
          {canEdit && (
            <>
              <button type="button" className="mpm-btn primary" onClick={handleSaveDraft} disabled={saving}>
                <FontAwesomeIcon icon={saving ? faSpinner : faSave} spin={saving} />
                {saving ? "Saving..." : "Save as Draft"}
              </button>
              <button type="button" className="mpm-btn submit" onClick={handleSubmitForApproval} disabled={saving || currentStatus !== "draft"}>
                <FontAwesomeIcon icon={faPen} />
                Submit for Approval
              </button>
              {canApprove && (
                <button type="button" className="mpm-btn approve" onClick={handleApprove} disabled={saving}>
                  <FontAwesomeIcon icon={faCheckCircle} />
                  Approve
                </button>
              )}
              {canMarkPaid && (
                <button type="button" className="mpm-btn paid" onClick={handleMarkAsPaid} disabled={saving}>
                  <FontAwesomeIcon icon={faFileInvoiceDollar} />
                  Mark as Paid
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualPayrollModal;
