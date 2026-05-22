/**
 * apiNormalize.js
 * Centralized entity-field extraction and API-shape normalization.
 * Import these instead of re-declaring per-component helpers.
 */

/* ── List / Array normalization ─────────────────────────────── */

export const normalizeList = (result, keys = []) => {
  if (Array.isArray(result)) return result;

  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.[key]?.data)) return result[key].data;
    if (Array.isArray(result?.data?.[key])) return result.data[key];
    if (Array.isArray(result?.data?.[key]?.data)) return result.data[key].data;
  }

  const fallbackKeys = [
    "data", "items", "orders", "requests", "service_requests",
    "appointments", "bookings", "boardings", "boarding_requests",
    "payments", "transactions", "logs", "history", "reports",
    "customers", "inventory", "inventory_items", "shipments",
    "confinements", "employees", "salaries", "payrolls",
    "records", "services", "patients", "pets",
    "medical_records", "veterinary_records", "medical_confinements",
    "available_rooms", "rooms", "hotel_rooms", "boarding",
    "archived", "batches", "products", "veterinarians", "care_logs",
  ];

  for (const key of fallbackKeys) {
    if (Array.isArray(result?.[key])) return result[key];
  }

  return [];
};

export const safeArray = (data) => (Array.isArray(data) ? data : []);

export const safeMap = (array, callback) => {
  if (!Array.isArray(array)) return [];
  return array.map(callback);
};

/* ── Entity name extractors ─────────────────────────────────── */

export const getPetName = (item) =>
  item?.pet?.name || item?.pet_name || item?.petName || item?.pet || "Unknown Pet";

export const getPetType = (item) =>
  item?.pet?.species || item?.pet?.type || item?.pet_species || item?.pet_type || "Pet";

export const getPetBreed = (item) => item?.pet?.breed || item?.breed || "Unknown breed";

export const getCustomerName = (item) =>
  item?.customer?.name ||
  item?.customer?.full_name ||
  item?.customer_name ||
  item?.owner_name ||
  item?.customer_email ||
  "Unknown Customer";

export const getCustomerEmail = (item) =>
  item?.customer?.email || item?.customer?.user?.email || item?.customer_email || item?.email || "No email";

export const getCustomerPhone = (item) =>
  item?.customer?.phone || item?.customer?.contact_number || item?.customer_phone || item?.owner_phone || item?.phone || "N/A";

export const getServiceName = (item) =>
  item?.name || item?.service_name || item?.title || "Service";

export const getServicePrice = (item) =>
  Number(item?.price || item?.service_price || item?.cost || item?.amount || 0);

export const getRoomName = (item) =>
  item?.hotel_room?.name || item?.hotel_room?.room_number || item?.room?.name || item?.room_number || item?.room_type || "Unassigned";

/* ── Date / Time helpers ────────────────────────────────────── */

export const getDateValue = (value) => {
  if (!value) return "";
  return String(value).includes("T") ? String(value).split("T")[0] : String(value).slice(0, 10);
};

export const formatDate = (value, fallback = "N/A") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
};

export const formatDateTime = (value, fallback = "N/A") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
};

/* ── Status helpers ─────────────────────────────────────────── */

export const normalizeStatus = (value) =>
  String(value || "pending").toLowerCase().replace(/\s+/g, "_");

export const normalizePaymentStatus = (value) => {
  const status = String(value || "unpaid").toLowerCase().replace(/\s+/g, "_");
  if (status === "verified" || status === "completed") return "paid";
  if (status === "for_payment") return "pending";
  return status;
};

export const formatStatus = (value) =>
  String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

/* ── Stock / Inventory helpers ──────────────────────────────── */

export const getAvailableStock = (item) => {
  const num = Number(
    item?.available_stock ?? item?.available_quantity ?? item?.current_stock ??
    item?.stock ?? item?.quantity ?? item?.total_stock ?? item?.stock_quantity ?? 0
  );
  return Number.isFinite(num) ? num : 0;
};

export const isOutOfStock = (item) => getAvailableStock(item) <= 0;

/* ── Currency helpers ───────────────────────────────────────── */

export const formatCurrency = (value, options = {}) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2, ...options,
  }).format(amount);
};

/* ── Product normalization (POS-specific) ─────────────────────── */

export const normProduct = (p, index = 0) => {
  const stock = getAvailableStock(p);
  return {
    ...p,
    id: p?.id ?? p?.inventory_item_id ?? p?.product_id ?? p?.item_id ?? index + 1,
    name: p?.name ?? p?.product_name ?? p?.item_name ?? "Unnamed Product",
    price: Number(p?.price ?? p?.selling_price ?? p?.unit_price ?? 0),
    stock,
    available_stock: stock,
    stock_status: stock > 0 ? "in_stock" : "out_of_stock",
    is_available: stock > 0,
    category: String(p?.category || p?.product_category || p?.type || "others").trim().toLowerCase(),
    image: p?.photo_url || p?.image || p?.image_url || p?.photo || "",
    barcode: p?.barcode || p?.sku || p?.item_code || "",
    discount: Number(p?.discount ?? p?.discount_percent ?? 0),
    raw: p,
  };
};

export const discountedPrice = (product) => {
  const price = Number(product?.price) || 0;
  const disc = Number(product?.discount) || 0;
  return disc > 0 ? price * (1 - disc / 100) : price;
};

/* ── Boarding / Hotel helpers ───────────────────────────────── */

export const getCheckInDate = (item) =>
  item?.check_in || item?.checkin_date || item?.booking_date || item?.appointment_date || item?.date || item?.created_at || "";

export const getCheckOutDate = (item) =>
  item?.check_out || item?.checkout_date || item?.end_date || item?.date_to || "";

export const getNotes = (item) =>
  item?.special_requests || item?.feeding_instructions || item?.notes || item?.remarks || "No notes provided";

export const isHotelRequest = (item) => {
  const values = [
    item?.type, item?.request_type, item?.service_type, item?.category,
    item?.source, item?.service, item?.service_name,
  ].filter(Boolean).map((v) => String(v).toLowerCase());
  return values.some((v) => v.includes("hotel") || v.includes("boarding") || v.includes("board"));
};

/* ── Unified entity helpers (requested) ─────────────────────── */

export const getEntityName = (item, entityType = "customer") => {
  if (!item) return "Unknown";
  if (entityType === "pet" || entityType === "patient") {
    return item?.name || item?.pet_name || item?.petName || item?.pet || "Unknown Pet";
  }
  if (entityType === "service") {
    return item?.name || item?.service_name || item?.title || item?.service || "Service";
  }
  if (entityType === "product") {
    return item?.name || item?.product_name || item?.item_name || "Product";
  }
  // default: customer
  return (
    item?.name || item?.full_name ||
    `${item?.first_name || ""} ${item?.last_name || ""}`.trim() ||
    item?.customer_name || item?.owner_name || item?.customer || "Unknown Customer"
  );
};

export const getEntityContact = (item, contactType = "phone") => {
  if (!item) return "N/A";
  if (contactType === "email") {
    return item?.email || item?.user?.email || item?.customer_email || "No email";
  }
  if (contactType === "phone") {
    return (
      item?.phone || item?.contact_number || item?.mobile ||
      item?.customer_phone || item?.owner_phone || "No contact"
    );
  }
  return "N/A";
};

export const getStockValue = (item) => getAvailableStock(item);

export const getStatusValue = (item, statusPath = "status") => {
  if (!item) return "pending";
  const raw = statusPath.includes(".")
    ? statusPath.split(".").reduce((obj, key) => obj?.[key], item)
    : item[statusPath];
  return normalizeStatus(raw);
};
