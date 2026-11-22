import {
  faBox,
  faCalendarCheck,
  faCheckCircle,
  faClock,
  faComments,
  faExclamationTriangle,
  faGear,
  faHotel,
  faInfoCircle,
  faMoneyBillWave,
  faReceipt,
  faRobot,
  faScissors,
  faShieldHalved,
  faStethoscope,
  faTimesCircle,
  faUser,
  faUserClock,
  faWarehouse,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

/**
 * Shared notification presentation mapping used by the header
 * NotificationDropdown and the customer CustomerNotifications page.
 *
 * Priority order (per notification-redesign requirements):
 *   1. Recognized data.category
 *   2. Recognized related_type
 *   3. Recognized legacy `type` keywords (e.g. order_submitted)
 *   4. Severity fallback from `type` (success/warning/error/info)
 *   5. Generic info fallback
 */

// Keyword -> icon. First match wins; keep most specific first.
const CATEGORY_RULES = [
  { keywords: ["security", "sign-in", "sign_in", "login", "auth"], icon: faShieldHalved, category: "security" },
  { keywords: ["inventory_batch", "batch", "stock", "inventory", "product", "warehouse"], icon: faWarehouse, category: "inventory" },
  { keywords: ["boarding", "hotel", "reservation", "room"], icon: faHotel, category: "boarding" },
  { keywords: ["vet", "medical", "confinement", "prescription", "vaccin"], icon: faStethoscope, category: "medical" },
  { keywords: ["appointment", "schedule", "calendar"], icon: faCalendarCheck, category: "appointment" },
  { keywords: ["grooming"], icon: faScissors, category: "grooming" },
  { keywords: ["payroll", "payslip", "salary"], icon: faMoneyBillWave, category: "payroll" },
  { keywords: ["payment", "receipt", "refund", "transaction", "sale", "invoice", "billing"], icon: faReceipt, category: "payment" },
  { keywords: ["order", "purchase"], icon: faBox, category: "order" },
  { keywords: ["service", "booking", "request"], icon: faCalendarCheck, category: "service" },
  { keywords: ["reminder"], icon: faClock, category: "reminder" },
  { keywords: ["probation", "staff", "employee", "attendance"], icon: faUserClock, category: "staff" },
  { keywords: ["customer", "user", "account", "profile"], icon: faUser, category: "account" },
  { keywords: ["chatbot"], icon: faRobot, category: "chatbot" },
  { keywords: ["chat", "message"], icon: faComments, category: "chat" },
  { keywords: ["system", "maintenance", "setting", "audit"], icon: faGear, category: "system" },
];

const SEVERITY_ICONS = {
  success: faCheckCircle,
  warning: faExclamationTriangle,
  error: faXmark,
  danger: faTimesCircle,
  info: faInfoCircle,
};

/**
 * Normalize the API `type` value to a CSS severity class suffix.
 * 'error' and 'danger' both map to the 'danger' styling used by CSS.
 */
export const normalizeSeverity = (type) => {
  const t = String(type || "").toLowerCase();
  if (t === "success") return "success";
  if (t === "warning") return "warning";
  if (t === "danger" || t === "error") return "danger";
  return "info";
};

const matchCategory = (haystack) => {
  const text = String(haystack || "").toLowerCase();
  if (!text) return null;
  return CATEGORY_RULES.find((rule) => rule.keywords.some((k) => text.includes(k))) || null;
};

/**
 * Resolve a notification row to { icon, severity, category }.
 * `severity` drives the icon chip color; `icon` is the category glyph.
 */
export const getNotificationMeta = (notification = {}) => {
  const severity = normalizeSeverity(notification.type);

  // 1-2. Explicit category, then related_type (also scan legacy snake_case
  // related types via the same keyword rules).
  const categoryHit =
    matchCategory(notification?.data?.category) ||
    matchCategory(notification?.data?.notification_category) ||
    matchCategory(notification?.related_type);

  // 3. Legacy `type` keywords like "order_submitted" / "payment_verified"
  // appear in historical rows — treat a non-severity type as a category hint.
  const legacyHit = categoryHit || matchCategory(
    ["success", "warning", "error", "danger", "info"].includes(String(notification.type || "").toLowerCase())
      ? null
      : notification.type
  );

  const icon = legacyHit?.icon || SEVERITY_ICONS[severity] || faInfoCircle;
  return { icon, severity, category: legacyHit?.category || "general" };
};
