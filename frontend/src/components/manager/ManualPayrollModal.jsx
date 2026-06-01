import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalculator,
  faCheckCircle,
  faExclamationTriangle,
  faMinus,
  faPlus,
  faSave,
  faSpinner,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
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

const NumberInput = ({ label, value, onChange, min = 0, step = 0.01, prefix = "" }) => (
  <label className="mpm-field">
    <span>{label}</span>
    <div className="mpm-number-wrap">
      {prefix && <small>{prefix}</small>}
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  </label>
);

const ManualPayrollModal = ({ onClose, onSaved }) => {
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [userId, setUserId] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStartInput());
  const [periodEnd, setPeriodEnd] = useState(todayInput());

  const [baseSalary, setBaseSalary] = useState(15000);
  const [hourlyRate, setHourlyRate] = useState("");
  const [workingDays, setWorkingDays] = useState(22);
  const [presentDays, setPresentDays] = useState(22);
  const [absentDays, setAbsentDays] = useState(0);
  const [regularHours, setRegularHours] = useState(176);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [overtimePay, setOvertimePay] = useState(0);
  const [regularHolidayPay, setRegularHolidayPay] = useState(0);
  const [specialHolidayPay, setSpecialHolidayPay] = useState(0);
  const [nightDifferential, setNightDifferential] = useState(0);
  const [regularHolidayOtPay, setRegularHolidayOtPay] = useState(0);
  const [specialHolidayOtPay, setSpecialHolidayOtPay] = useState(0);
  const [bonus, setBonus] = useState(0);
  const [allowances, setAllowances] = useState(0);

  const [sss, setSss] = useState(0);
  const [philhealth, setPhilhealth] = useState(0);
  const [pagibig, setPagibig] = useState(100);
  const [tax, setTax] = useState(0);
  const [lateDeductions, setLateDeductions] = useState(0);
  const [absentDeductions, setAbsentDeductions] = useState(0);
  const [otherDeductions, setOtherDeductions] = useState(0);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    setLoadingEmployees(true);
    apiRequest("/manager/staff")
      .then((res) => {
        const list = res?.staff || res?.data?.staff || [];
        setEmployees(list);
        if (list.length > 0) setUserId(String(list[0].id));
      })
      .catch(() => setError("Could not load employees."))
      .finally(() => setLoadingEmployees(false));
  }, []);

  useEffect(() => {
    if (baseSalary && !hourlyRate) {
      setHourlyRate(Number((baseSalary / 160).toFixed(2)));
    }
  }, [baseSalary, hourlyRate]);

  const computed = useMemo(() => {
    const bs = toNum(baseSalary);
    const hr = toNum(hourlyRate);
    const otHrs = toNum(overtimeHours);
    const otPay = toNum(overtimePay);
    const bon = toNum(bonus);
    const allw = toNum(allowances);
    const sssVal = toNum(sss);
    const phil = toNum(philhealth);
    const pag = toNum(pagibig);
    const tx = toNum(tax);
    const late = toNum(lateDeductions);
    const absent = toNum(absentDeductions);
    const other = toNum(otherDeductions);

    const rhPay = toNum(regularHolidayPay);
    const shPay = toNum(specialHolidayPay);
    const nd = toNum(nightDifferential);
    const rhOt = toNum(regularHolidayOtPay);
    const shOt = toNum(specialHolidayOtPay);

    const derivedOtPay = otPay || (otHrs * hr * 1.5);
    const gross = bs + derivedOtPay + rhPay + shPay + nd + rhOt + shOt + bon + allw;
    const totalDed = sssVal + phil + pag + tx + late + absent + other;
    const net = Math.max(0, gross - totalDed);

    return { gross, totalDed, net, derivedOtPay };
  }, [baseSalary, hourlyRate, overtimeHours, overtimePay, regularHolidayPay, specialHolidayPay, nightDifferential, regularHolidayOtPay, specialHolidayOtPay, bonus, allowances, sss, philhealth, pagibig, tax, lateDeductions, absentDeductions, otherDeductions]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => String(e.id) === String(userId)),
    [employees, userId]
  );

  const handleSave = useCallback(async () => {
    if (!userId) { setError("Please select an employee."); return; }
    if (!periodStart || !periodEnd) { setError("Please select a pay period."); return; }

    setSaving(true);
    setError("");
    try {
      await apiRequest("/manager/payroll", {
        method: "POST",
        body: JSON.stringify({
          user_id: Number(userId),
          pay_period_start: periodStart,
          pay_period_end: periodEnd,
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
          deductions: toNum(otherDeductions),
          tax_deduction: toNum(tax),
          sss_contribution: toNum(sss),
          philhealth_contribution: toNum(philhealth),
          pagibig_contribution: toNum(pagibig),
          late_deductions: toNum(lateDeductions),
          absent_deductions: toNum(absentDeductions),
          gross_pay: computed.gross,
          net_pay: computed.net,
          remarks: remarks || "",
        }),
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save payroll.");
    } finally {
      setSaving(false);
    }
  }, [userId, periodStart, periodEnd, baseSalary, hourlyRate, workingDays, presentDays, absentDays, regularHours, overtimeHours, computed, regularHolidayPay, specialHolidayPay, nightDifferential, regularHolidayOtPay, specialHolidayOtPay, bonus, allowances, sss, philhealth, pagibig, tax, lateDeductions, absentDeductions, otherDeductions, remarks, onSaved, onClose]);

  return (
    <div className="mpm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mpm-dialog">
        <div className="mpm-header">
          <div>
            <span className="mpm-eyebrow">Manual Payroll</span>
            <h2>Compute Payroll Manually</h2>
          </div>
          <button type="button" className="mpm-close" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {error && (
          <div className="mpm-alert error">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <span>{error}</span>
          </div>
        )}

        <div className="mpm-body">
          {/* Top row: Employee + Period */}
          <div className="mpm-row top">
            <label className="mpm-field employee">
              <span>Employee</span>
              <div className="mpm-select-wrap">
                <FontAwesomeIcon icon={faUser} />
                <select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={loadingEmployees}>
                  {loadingEmployees && <option>Loading...</option>}
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} — {e.role}</option>
                  ))}
                </select>
              </div>
            </label>

            <label className="mpm-field">
              <span>Period Start</span>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="mpm-field">
              <span>Period End</span>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>

          {selectedEmployee && (
            <div className="mpm-employee-card">
              <strong>{selectedEmployee.name}</strong>
              <small>{selectedEmployee.role} · {selectedEmployee.department || "Unassigned"}</small>
            </div>
          )}

          <div className="mpm-grid">
            {/* Earnings Column */}
            <div className="mpm-col">
              <div className="mpm-col-header">
                <FontAwesomeIcon icon={faPlus} />
                <h3>Earnings</h3>
              </div>
              <div className="mpm-fields">
                <NumberInput label="Base Salary" value={baseSalary} onChange={setBaseSalary} prefix="₱" />
                <NumberInput label="Hourly Rate" value={hourlyRate} onChange={setHourlyRate} prefix="₱" />
                <div className="mpm-row-inner">
                  <NumberInput label="Working Days" value={workingDays} onChange={setWorkingDays} step={1} />
                  <NumberInput label="Present Days" value={presentDays} onChange={setPresentDays} step={1} />
                  <NumberInput label="Absent Days" value={absentDays} onChange={setAbsentDays} step={1} />
                </div>
                <div className="mpm-row-inner">
                  <NumberInput label="Regular Hours" value={regularHours} onChange={setRegularHours} />
                  <NumberInput label="Overtime Hours" value={overtimeHours} onChange={setOvertimeHours} />
                </div>
                <NumberInput label="Overtime Pay" value={overtimePay} onChange={setOvertimePay} prefix="₱" />
                <NumberInput label="Regular Holiday Pay" value={regularHolidayPay} onChange={setRegularHolidayPay} prefix="₱" />
                <NumberInput label="Special Holiday Pay" value={specialHolidayPay} onChange={setSpecialHolidayPay} prefix="₱" />
                <NumberInput label="Night Differential" value={nightDifferential} onChange={setNightDifferential} prefix="₱" />
                <NumberInput label="Reg. Holiday OT Pay" value={regularHolidayOtPay} onChange={setRegularHolidayOtPay} prefix="₱" />
                <NumberInput label="Spl. Holiday OT Pay" value={specialHolidayOtPay} onChange={setSpecialHolidayOtPay} prefix="₱" />
                <NumberInput label="Bonus" value={bonus} onChange={setBonus} prefix="₱" />
                <NumberInput label="Allowances" value={allowances} onChange={setAllowances} prefix="₱" />
              </div>
            </div>

            {/* Deductions Column */}
            <div className="mpm-col">
              <div className="mpm-col-header">
                <FontAwesomeIcon icon={faMinus} />
                <h3>Deductions</h3>
              </div>
              <div className="mpm-fields">
                <NumberInput label="SSS Contribution" value={sss} onChange={setSss} prefix="₱" />
                <NumberInput label="PhilHealth Contribution" value={philhealth} onChange={setPhilhealth} prefix="₱" />
                <NumberInput label="Pag-IBIG Contribution" value={pagibig} onChange={setPagibig} prefix="₱" />
                <NumberInput label="Tax Deduction" value={tax} onChange={setTax} prefix="₱" />
                <NumberInput label="Late Deductions" value={lateDeductions} onChange={setLateDeductions} prefix="₱" />
                <NumberInput label="Absent Deductions" value={absentDeductions} onChange={setAbsentDeductions} prefix="₱" />
                <NumberInput label="Other Deductions" value={otherDeductions} onChange={setOtherDeductions} prefix="₱" />
              </div>
            </div>
          </div>

          {/* Computed totals */}
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

          <label className="mpm-field remarks">
            <span>Remarks</span>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes..." />
          </label>
        </div>

        <div className="mpm-footer">
          <button type="button" className="mpm-btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="mpm-btn primary" onClick={handleSave} disabled={saving}>
            <FontAwesomeIcon icon={saving ? faSpinner : faSave} spin={saving} />
            {saving ? "Saving..." : "Save Payroll"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualPayrollModal;
