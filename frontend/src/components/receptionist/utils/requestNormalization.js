/**
 * Unified request normalization utilities for the receptionist hub.
 * Normalizes data from /receptionist/requests, /receptionist/appointment/list,
 * /boardings, and /grooming into a single consistent schema.
 */

export const safeText = (value) => String(value || "").trim().toLowerCase();

export const safeArray = (data, key) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.[key])) return data.data[key];
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

export const normalizeList = (result, keys = []) => {
  if (Array.isArray(result)) return result;
  for (const key of keys) {
    if (Array.isArray(result?.[key])) return result[key];
    if (Array.isArray(result?.data?.[key])) return result.data[key];
    if (Array.isArray(result?.[key]?.data)) return result[key].data;
    if (Array.isArray(result?.data?.[key]?.data)) return result.data[key].data;
  }
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.data?.data)) return result.data.data;
  if (Array.isArray(result?.requests)) return result.requests;
  if (Array.isArray(result?.service_requests)) return result.service_requests;
  if (Array.isArray(result?.pending_requests)) return result.pending_requests;
  if (Array.isArray(result?.boardings)) return result.boardings;
  if (Array.isArray(result?.boarding_requests)) return result.boarding_requests;
  return [];
};

export const normalizeType = (value = "") => {
  const type = String(value || "").toLowerCase();
  if (type.includes("groom")) return "grooming";
  if (type.includes("hotel") || type.includes("boarding") || type.includes("board")) return "hotel";
  if (type.includes("vet") || type.includes("medical") || type.includes("consult") || type.includes("vaccination")) return "vet";
  return type || "service";
};

export const normalizeStatus = (value = "") => {
  const status = String(value || "").toLowerCase().replace(/\s+/g, "_");
  if (status === "approved" || status === "scheduled" || status === "confirmed") return "approved";
  if (status === "rejected" || status === "cancelled" || status === "canceled") return "rejected";
  if (status === "checked_in" || status === "checkedin") return "checked_in";
  if (status === "checked_out" || status === "checkedout") return "checked_out";
  if (status === "in_progress" || status === "inprogress") return "in_progress";
  if (status === "for_payment" || status === "for payment") return "pending";
  return status || "pending";
};

export const normalizePaymentStatus = (value = "") => {
  const payment = String(value || "").toLowerCase();
  if (payment === "paid" || payment === "verified" || payment === "completed") return "paid";
  if (payment === "unpaid") return "unpaid";
  if (payment === "partial") return "partial";
  if (payment === "pending" || payment === "for_payment" || payment === "for payment") return "pending";
  return "pending";
};

export const formatStatus = (status) =>
  String(status || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const formatDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
};

export const formatTime = (value) => {
  if (!value) return "";
  if (String(value).includes("AM") || String(value).includes("PM")) return value;
  if (String(value).includes("T")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
    }
  }
  const [hour, minute] = String(value).split(":");
  if (!hour || !minute) return value;
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
};

export const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
};

export const getPetName = (item) =>
  item.pet?.name || item.pet_name || item.petName || item.pet || "Unknown Pet";

export const getCustomerName = (item) =>
  item.customer?.name || item.customer_name || item.client_name || item.owner_name || item.user?.name || "Unknown Customer";

export const getCustomerPhone = (item) =>
  item.customer?.phone || item.customer_phone || item.client_phone || item.owner_phone || "";

export const getServiceName = (item) =>
  item.service?.name || item.service_name || item.service || item.name || item.package_name || "Service";

export const getDateValue = (item) =>
  item.date || item.booking_date || item.appointment_date || item.request_date || item.scheduled_at || item.schedule_date || item.check_in || item.check_in_date || item.created_at || "";

export const getTimeValue = (item) =>
  item.time || item.booking_time || item.appointment_time || item.request_time || item.scheduled_time || item.check_in_time || "";

/**
 * Normalize an appointment (vet) item from /receptionist/appointment/list
 */
export const normalizeAppointment = (item) => {
  const scheduledAt = item.scheduled_at || item.appointment_date || item.date || item.booking_date || "";
  const status = normalizeStatus(item.status);
  return {
    id: item.id,
    rawId: item.id,
    type: "vet",
    petName: getPetName(item),
    petType: item.pet?.species || item.pet?.type || item.pet_type || "Pet",
    breed: item.pet?.breed || item.breed || "",
    customerName: getCustomerName(item),
    customerPhone: getCustomerPhone(item),
    service: getServiceName(item),
    date: getDateValue(item),
    time: getTimeValue(item),
    status,
    amount: Number(item.price || item.amount || item.total_amount || 0),
    paidAmount: Number(item.paid_amount || 0),
    paymentStatus: normalizePaymentStatus(item.payment_status),
    notes: item.symptoms || item.medical_notes || item.notes || item.remarks || item.special_requests || "",
    createdAt: item.created_at || scheduledAt || new Date().toISOString(),
    raw: item,
  };
};

/**
 * Normalize a boarding (hotel) item from /boardings
 */
export const normalizeBoarding = (item) => {
  const status = normalizeStatus(item.status);
  return {
    id: item.id,
    rawId: item.id,
    type: "hotel",
    petName: getPetName(item),
    petType: item.pet?.species || item.pet?.type || item.pet_type || "Pet",
    breed: item.pet?.breed || item.breed || "",
    customerName: getCustomerName(item),
    customerPhone: getCustomerPhone(item),
    service: item.service_name || "Hotel Stay",
    roomType: item.room_type || item.hotel_room?.name || item.hotel_room_id || "Room",
    checkIn: item.check_in || "",
    checkOut: item.check_out || "",
    date: item.check_in || item.check_in_date || item.created_at || "",
    time: item.check_in_time || "",
    status,
    amount: Number(item.total_amount || item.amount || 0),
    paidAmount: Number(item.paid_amount || 0),
    paymentStatus: normalizePaymentStatus(item.payment_status || "pending"),
    notes: item.notes || item.special_requests || "",
    vaccination_card: item.vaccination_card || null,
    vaccination_card_url: item.vaccination_card_url || null,
    vaccination_card_verified_at: item.vaccination_card_verified_at || null,
    createdAt: item.created_at || item.check_in || new Date().toISOString(),
    raw: item,
  };
};

/**
 * Normalize a grooming item from /grooming
 */
export const normalizeGrooming = (item) => {
  const scheduledAt = item.scheduled_at || item.appointment_date || item.date || item.booking_date || "";
  const status = normalizeStatus(item.status);
  return {
    id: item.id,
    rawId: item.id,
    type: "grooming",
    petName: getPetName(item),
    petType: item.pet?.species || item.pet?.type || item.pet_type || "Pet",
    breed: item.pet?.breed || item.breed || "",
    customerName: getCustomerName(item),
    customerPhone: getCustomerPhone(item),
    service: getServiceName(item),
    date: getDateValue(item),
    time: getTimeValue(item),
    status,
    amount: Number(item.amount || item.price || item.total_amount || 0),
    paidAmount: Number(item.paid_amount || 0),
    paymentStatus: normalizePaymentStatus(item.payment_status || "unpaid"),
    notes: item.special_requests || item.notes || item.remarks || "",
    createdAt: item.created_at || scheduledAt || new Date().toISOString(),
    raw: item,
  };
};

/**
 * Normalize a generic request item from /receptionist/requests
 */
export const normalizeGenericRequest = (item, index) => {
  const rawId = item.id || item.request_id || item.service_request_id || item.booking_id || index + 1;
  const type = normalizeType(
    item.type || item.request_type || item.service_type || item.source || item.category || item.service_name || item.service?.name || ""
  );
  const status = normalizeStatus(item.status);
  const payment = normalizePaymentStatus(item.payment || item.payment_status);
  const date = getDateValue(item);
  const time = getTimeValue(item);

  return {
    id: rawId,
    rawId,
    type,
    petName: getPetName(item),
    petType: item.pet?.species || item.pet?.type || item.pet_type || "Pet",
    breed: item.pet?.breed || item.breed || "",
    customerName: getCustomerName(item),
    customerPhone: getCustomerPhone(item),
    service: getServiceName(item),
    date,
    time,
    status,
    amount: Number(item.price || item.amount || item.total_amount || item.total || 0),
    paidAmount: Number(item.paid_amount || 0),
    paymentStatus: payment,
    notes:
      item.notes || item.remarks || item.special_request || item.special_requests || item.description || item.symptoms || item.medical_notes || "",
    createdAt: item.created_at || date || new Date().toISOString(),
    raw: item,
  };
};

/**
 * Combine and deduplicate normalized items by id + type.
 * When duplicates exist, prefer the more detailed source (appointments/boardings/grooming)
 * over the generic request list.
 */
export const mergeRequests = (genericRequests = [], appointments = [], boardings = [], groomings = []) => {
  const map = new Map();

  // Add generic requests first (lowest priority)
  genericRequests.forEach((item) => {
    const key = `${item.type}-${item.rawId}`;
    map.set(key, item);
  });

  // Overwrite with detailed appointments
  appointments.forEach((item) => {
    const key = `${item.type}-${item.rawId}`;
    map.set(key, item);
  });

  // Overwrite with detailed boardings
  boardings.forEach((item) => {
    const key = `${item.type}-${item.rawId}`;
    map.set(key, item);
  });

  // Overwrite with detailed groomings
  groomings.forEach((item) => {
    const key = `${item.type}-${item.rawId}`;
    map.set(key, item);
  });

  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};
