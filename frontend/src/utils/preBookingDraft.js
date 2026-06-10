const STORAGE_KEY = "pawesome_pre_booking_draft";

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
