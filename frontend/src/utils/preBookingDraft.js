const STORAGE_KEY = "pawesome_pre_booking_draft";
const SERVICE_INTENT_KEY = "pawesome_pending_service_intent";
const SERVICE_TYPES = new Set(["hotel", "grooming", "vet"]);

export const saveDraft = (serviceType, formData) => {
  try {
    const draft = {
      service_type: serviceType,
      form_data: { ...formData },
      saved_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

export const getDraft = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object") return null;
    if (!draft.service_type || !draft.form_data) return null;
    return draft;
  } catch {
    return null;
  }
};

export const clearDraft = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};

export const hasDraft = () => {
  return !!getDraft();
};

export const saveServiceIntent = (serviceType) => {
  if (!SERVICE_TYPES.has(serviceType)) return false;
  try {
    localStorage.setItem(SERVICE_INTENT_KEY, JSON.stringify({ service_type: serviceType, saved_at: Date.now() }));
    return true;
  } catch {
    return false;
  }
};

export const getServiceIntent = () => {
  try {
    const intent = JSON.parse(localStorage.getItem(SERVICE_INTENT_KEY) || "null");
    if (!intent || !SERVICE_TYPES.has(intent.service_type)) return null;
    if (Date.now() - Number(intent.saved_at) > 24 * 60 * 60 * 1000) {
      clearServiceIntent();
      return null;
    }
    return intent.service_type;
  } catch {
    return null;
  }
};

export const clearServiceIntent = () => {
  try {
    localStorage.removeItem(SERVICE_INTENT_KEY);
    return true;
  } catch {
    return false;
  }
};
