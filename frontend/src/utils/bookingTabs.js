/**
 * Shared tab and date-preset logic for the receptionist booking pages.
 * The backend assigns `workflow_stage` (see BookingWorkflowStage.php);
 * this file only filters on that value and on the service date.
 * All date math is done on YYYY-MM-DD strings in UTC so the browser's
 * timezone cannot shift the day boundary.
 */

export const BOOKING_TABS = [
  { key: "all", label: "ALL" },
  { key: "to_approve", label: "TO APPROVE" },
  { key: "to_pay", label: "TO PAY" },
  { key: "on_going", label: "ON GOING" },
  { key: "ready_to_pickup", label: "READY TO PICKUP" },
  { key: "complete", label: "COMPLETE" },
  { key: "canceled", label: "CANCELED" },
];

export const DATE_PRESETS = [
  { key: "today", label: "TODAY" },
  { key: "upcoming", label: "UPCOMING" },
  { key: "yesterday", label: "YESTERDAY" },
  { key: "7d", label: "7 DAYS" },
  { key: "1m", label: "1 MONTH" },
];

const shiftDate = (ymd, days) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

const shiftMonth = (ymd, months) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
};

/** Inclusive {from, to} for a preset, anchored on the store's current date. */
export const getDateRange = (preset, storeToday) => {
  switch (preset) {
    case "yesterday": {
      const y = shiftDate(storeToday, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: shiftDate(storeToday, -6), to: storeToday };
    case "1m":
      return { from: shiftMonth(storeToday, -1), to: storeToday };
    case "upcoming":
      return { from: storeToday, to: shiftDate(storeToday, 60) };
    case "all":
      return { from: "0001-01-01", to: "9999-12-31" };
    default:
      return { from: storeToday, to: storeToday };
  }
};

export const isDateInRange = (ymd, range) => Boolean(ymd) && ymd >= range.from && ymd <= range.to;

/** Service date (YYYY-MM-DD) of a booking, per module. */
export const getServiceDate = (item) => {
  const raw = item.check_in || item.check_in_date || item.appointmentDate || item.dateValue || item.date || item.request_date || item.created_at || "";
  return String(raw).slice(0, 10);
};

/** Hotel stay that is still in progress on the store's current date. */
export const isLiveStay = (item, storeToday) => {
  if (!["checked_in", "in_care", "ready_for_pickup"].includes(item.status)) return false;
  const checkIn = String(item.check_in || "").slice(0, 10);
  const checkOut = String(item.check_out || item.check_in || "").slice(0, 10);
  return Boolean(checkIn) && checkIn <= storeToday && storeToday <= checkOut;
};

/**
 * Whether a booking belongs in the list for the chosen date preset.
 * Live hotel stays also appear on TODAY, so pets still in the hotel stay visible.
 */
export const matchesDatePreset = (item, preset, range, storeToday, { carryLiveStays = false } = {}) => {
  if (isDateInRange(getServiceDate(item), range)) return true;
  return carryLiveStays && preset === "today" && isLiveStay(item, storeToday);
};

/** Counts per tab for a date-filtered list. ALL is the total. */
export const countByTab = (items) => {
  const counts = Object.fromEntries(BOOKING_TABS.map((tab) => [tab.key, 0]));
  items.forEach((item) => {
    counts.all += 1;
    if (counts[item.workflow_stage] !== undefined) counts[item.workflow_stage] += 1;
  });
  return counts;
};

/** Pending requests whose service date is before the selected range. */
export const countOlderPending = (items, range) =>
  items.filter((item) => item.workflow_stage === "to_approve" && getServiceDate(item) && getServiceDate(item) < range.from).length;

/* Customer board: same stage keys as staff, customer wording and date presets. */
export const CUSTOMER_STAGE_LABELS = {
  all: "All",
  to_approve: "Waiting for approval",
  to_pay: "Payment needed",
  on_going: "In progress",
  ready_to_pickup: "Ready for pickup",
  complete: "Completed",
  canceled: "Cancelled",
};

// Customers pay from their booking rows, so there is no customer payment tab.
export const CUSTOMER_TAB_SHORT_LABELS = {
  all: "All",
  to_approve: "Pending",
  to_pay: "Payment",
  on_going: "Ongoing",
  ready_to_pickup: "Pickup",
  complete: "Done",
  canceled: "Cancelled",
};

export const CUSTOMER_BOOKING_TABS = BOOKING_TABS
  .filter((tab) => tab.key !== "to_pay")
  .map((tab) => ({ ...tab, label: CUSTOMER_TAB_SHORT_LABELS[tab.key], title: CUSTOMER_STAGE_LABELS[tab.key] }));

export const CUSTOMER_DATE_PRESETS = [
  { key: "upcoming", label: "UPCOMING" },
  { key: "7d", label: "LAST 7 DAYS" },
  { key: "1m", label: "LAST MONTH" },
  { key: "all", label: "ALL DATES" },
];

/** Open bookings dated after the selected range (hidden by it, but still needing attention). */
export const countLater = (items, range) =>
  items.filter((item) =>
    !["complete", "canceled"].includes(item.workflow_stage) && getServiceDate(item) && getServiceDate(item) > range.to
  ).length;
