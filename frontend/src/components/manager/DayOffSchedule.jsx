import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarWeek,
  faFloppyDisk,
  faMagnifyingGlass,
  faRotate,
} from "@fortawesome/free-solid-svg-icons";
import { apiRequest } from "../../api/client";
import { showAlert } from "../../utils/alert.jsx";
import "./DayOffSchedule.css";

const WEEKDAYS = [
  { dow: 0, short: "Sun", label: "Sunday" },
  { dow: 1, short: "Mon", label: "Monday" },
  { dow: 2, short: "Tue", label: "Tuesday" },
  { dow: 3, short: "Wed", label: "Wednesday" },
  { dow: 4, short: "Thu", label: "Thursday" },
  { dow: 5, short: "Fri", label: "Friday" },
  { dow: 6, short: "Sat", label: "Saturday" },
];

const DEFAULT_OFF_LABEL = "Mon–Sat work · Sun off (company default)";

const sameDays = (a, b) => {
  const x = [...a].sort().join(",");
  const y = [...b].sort().join(",");
  return x === y;
};

const DayOffSchedule = () => {
  const [people, setPeople]       = useState([]);
  const [drafts, setDrafts]       = useState({}); // personId -> number[]
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId]   = useState(null);
  const [search, setSearch]       = useState("");
  const [configuredOnly, setConfiguredOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiRequest("/manager/people");
      const list = Array.isArray(res?.data) ? res.data : [];
      setPeople(list);
      // Seed drafts from server state
      const next = {};
      list.forEach((p) => { next[p.id] = [...(p.day_offs || [])]; });
      setDrafts(next);
    } catch (e) {
      setPeople([]);
      setLoadError(e.message || "Failed to load staff list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (!p.is_active) return false;
      if (configuredOnly && !(p.day_offs || []).length) return false;
      if (!q) return true;
      return (
        (p.name || "").toLowerCase().includes(q) ||
        (p.employee_no || "").toLowerCase().includes(q) ||
        (p.department || "").toLowerCase().includes(q) ||
        (p.position || p.role || "").toLowerCase().includes(q)
      );
    });
  }, [people, search, configuredOnly]);

  const toggle = (person, dow) => {
    const current = drafts[person.id] ?? [...(person.day_offs || [])];
    const next = current.includes(dow)
      ? current.filter((d) => d !== dow)
      : [...current, dow];
    setDrafts((prev) => ({ ...prev, [person.id]: next }));
  };

  const isDirty = (person) =>
    !sameDays(drafts[person.id] ?? [], person.day_offs || []);

  const save = async (person) => {
    const days = drafts[person.id] ?? [];
    if (days.length === 0) {
      await showAlert(
        `${person.name} must keep at least one day off. A person can't be scheduled 7 days a week — leave the row untouched to keep the company default instead.`,
        "warning"
      );
      return;
    }
    setSavingId(person.id);
    try {
      const res = await apiRequest(`/manager/people/${person.person_type}/${person.user_id ?? person.employee_id}/day-offs`, {
        method: "PUT",
        body: JSON.stringify({ days }),
      });
      const saved = res?.data?.day_offs ?? days;
      setPeople((prev) =>
        prev.map((p) => (p.id === person.id ? { ...p, day_offs: saved } : p))
      );
      setDrafts((prev) => ({ ...prev, [person.id]: [...saved] }));
    } catch (e) {
      await showAlert(e.message || "Failed to save day-off schedule.", "error");
    } finally {
      setSavingId(null);
    }
  };

  const resetDraft = (person) => {
    setDrafts((prev) => ({ ...prev, [person.id]: [...(person.day_offs || [])] }));
  };

  const offLabel = (days) => {
    if (!days.length) return DEFAULT_OFF_LABEL;
    return "Off: " + days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAYS[d].short)
      .join(", ");
  };

  return (
    <div className="dos-page">
      {/* Hero */}
      <div className="dos-hero">
        <div className="dos-hero-left">
          <div className="dos-eyebrow">
            <FontAwesomeIcon icon={faCalendarWeek} />
            Staff Scheduling
          </div>
          <h1>Day-Off Schedule</h1>
          <p>
            The business operates 7 days a week. Assign each staff member's
            weekly rest day(s) — payroll counts absences only on their
            scheduled days, and punching on a day-off earns the 130%
            rest-day rate.
          </p>
        </div>
        <div className="dos-hero-actions">
          <div className="dos-search">
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <input
              type="text"
              placeholder="Search name, ID, department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="dos-filter-toggle">
            <input
              type="checkbox"
              checked={configuredOnly}
              onChange={(e) => setConfiguredOnly(e.target.checked)}
            />
            Configured only
          </label>
        </div>
      </div>

      {loadError && <div className="dos-banner error">{loadError}</div>}

      <div className="dos-card">
        <table className="dos-table">
          <thead>
            <tr>
              <th className="dos-col-person">Staff</th>
              <th className="dos-col-days">Weekly day-offs</th>
              <th className="dos-col-summary">Schedule</th>
              <th className="dos-col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="dos-empty">Loading staff…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={4} className="dos-empty">No staff match.</td></tr>
            ) : (
              visible.map((p) => {
                const draft = drafts[p.id] ?? [];
                const dirty = isDirty(p);
                const saving = savingId === p.id;
                return (
                  <tr key={p.id} className={dirty ? "is-dirty" : ""}>
                    <td className="dos-col-person">
                      <div className="dos-name">{p.name}</div>
                      <div className="dos-meta">
                        {p.employee_no || "—"} · {p.position || p.role || "staff"}
                        {p.person_type === "employee" && (
                          <span className="dos-tag">No account</span>
                        )}
                      </div>
                    </td>
                    <td className="dos-col-days">
                      <div className="dos-chips" role="group" aria-label={`Day-offs for ${p.name}`}>
                        {WEEKDAYS.map((w) => (
                          <button
                            key={w.dow}
                            type="button"
                            className={`dos-chip ${draft.includes(w.dow) ? "is-off" : ""}`}
                            title={`${w.label} — ${draft.includes(w.dow) ? "day off" : "workday"}`}
                            aria-pressed={draft.includes(w.dow)}
                            onClick={() => toggle(p, w.dow)}
                          >
                            {w.short}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="dos-col-summary">
                      <span className={draft.length ? "" : "dos-default"}>
                        {offLabel(draft)}
                      </span>
                    </td>
                    <td className="dos-col-actions">
                      {dirty && (
                        <button
                          type="button"
                          className="dos-btn ghost"
                          title="Discard changes"
                          onClick={() => resetDraft(p)}
                          disabled={saving}
                        >
                          <FontAwesomeIcon icon={faRotate} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="dos-btn primary"
                        onClick={() => save(p)}
                        disabled={!dirty || saving}
                      >
                        <FontAwesomeIcon icon={faFloppyDisk} />
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="dos-hint">
        Rows with no assigned day-off keep the company default ({DEFAULT_OFF_LABEL}).
        Assign at least one day off to switch that person to a custom schedule.
      </p>
    </div>
  );
};

export default DayOffSchedule;
