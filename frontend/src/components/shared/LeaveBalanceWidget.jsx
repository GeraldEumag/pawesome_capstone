import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import "./LeaveBalanceWidget.css";

const TYPE_LABELS = {
  sick_leave:              "Sick",
  vacation_leave:          "Vacation",
  emergency_leave:         "Emergency",
  maternity_leave:         "Maternity",
  paternity_leave:         "Paternity",
  bereavement_leave:       "Bereavement",
  service_incentive_leave: "SIL",
  solo_parent_leave:       "Solo Parent",
  magna_carta_leave:       "Magna Carta",
  special_leave_benefit:   "Special",
};

/**
 * Compact leave balance chips.
 *
 * Usage:
 *   <LeaveBalanceWidget userId={5} />                   // for an account user
 *   <LeaveBalanceWidget employeeId={3} />               // for a non-account employee (manager view)
 *   <LeaveBalanceWidget selfService />                  // employee self-service (calls /my-leaves/balance)
 */
const LeaveBalanceWidget = ({ userId, employeeId, selfService }) => {
  const [balances, setBalances] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let url;
    if (selfService) {
      url = "/my-leaves/balance";
    } else if (userId) {
      url = `/manager/leave-balances/${userId}/user`;
    } else if (employeeId) {
      url = `/manager/leave-balances/${employeeId}/employee`;
    } else {
      setLoading(false); return;
    }

    apiRequest(url)
      .then((r) => {
        const list = r?.data || r;
        setBalances(Array.isArray(list) ? list : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, employeeId, selfService]);

  if (loading) return <div className="lbw-loading">Loading balances…</div>;
  if (!balances.length) return null;

  return (
    <div className="lbw-row">
      {balances
        .filter((b) => b.leave_type !== "unpaid_leave")
        .map((b) => {
          const pct = b.total_days > 0 ? (b.remaining_days / b.total_days) * 100 : 0;
          const color = pct >= 50 ? "#059669" : pct >= 20 ? "#f59e0b" : "#ef4444";
          return (
            <div key={b.leave_type} className="lbw-chip" title={`${b.remaining_days} of ${b.total_days} days remaining`}>
              <span className="lbw-label">{TYPE_LABELS[b.leave_type] || b.leave_type}</span>
              <div className="lbw-bar-track">
                <div className="lbw-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
              </div>
              <span className="lbw-count" style={{ color }}>{b.remaining_days}<small>/{b.total_days}</small></span>
            </div>
          );
        })}
    </div>
  );
};

export default LeaveBalanceWidget;
