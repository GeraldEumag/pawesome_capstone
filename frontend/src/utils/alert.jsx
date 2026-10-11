import Swal from "sweetalert2";

const lightTheme = {
  customClass: {
    popup: "swal2-light-popup",
    confirmButton: "swal2-light-confirm",
    cancelButton: "swal2-light-cancel",
    title: "swal2-light-title",
    htmlContainer: "swal2-light-text",
  },
  buttonsStyling: false,
  confirmButtonText: "OK",
  cancelButtonText: "Cancel",
  showCloseButton: true,
  allowOutsideClick: false,
  allowEscapeKey: true,
  backdrop: true,
  heightAuto: false,
};

export const showAlert = async (message, title = "") => {
  return Swal.fire({
    ...lightTheme,
    title,
    text: message,
    icon: "info",
    showCancelButton: false,
    confirmButtonText: "OK",
  });
};

export const showSuccess = async (message, title = "Success") => {
  return Swal.fire({
    ...lightTheme,
    title,
    text: message,
    icon: "success",
    showCancelButton: false,
    confirmButtonText: "OK",
  });
};

export const showError = async (message, title = "Error") => {
  return Swal.fire({
    ...lightTheme,
    title,
    text: message,
    icon: "error",
    showCancelButton: false,
    confirmButtonText: "OK",
  });
};

export const showWarning = async (message, title = "Warning") => {
  return Swal.fire({
    ...lightTheme,
    title,
    text: message,
    icon: "warning",
    showCancelButton: false,
    confirmButtonText: "OK",
  });
};

export const showConfirm = async (
  message,
  title = "",
  confirmText = "Yes",
  cancelText = "Cancel",
  icon = "question",
  danger = false
) => {
  const customClass = { ...lightTheme.customClass };
  if (danger) {
    customClass.confirmButton = "swal2-light-confirm swal2-light-confirm-danger";
  }
  const result = await Swal.fire({
    ...lightTheme,
    customClass,
    title,
    text: message,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
  });
  return result.isConfirmed;
};

export const showDeleteConfirm = async (
  itemName = "this item",
  message = `Are you sure you want to delete <strong>${itemName}</strong>? This action cannot be undone.`
) => {
  const result = await Swal.fire({
    ...lightTheme,
    title: "Delete Confirmation",
    html: message,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Delete",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#dc3545",
    reverseButtons: true,
  });
  return result.isConfirmed;
};

export const showPrompt = async (
  message,
  title = "",
  defaultValue = "",
  confirmText = "OK",
  cancelText = "Cancel"
) => {
  const result = await Swal.fire({
    ...lightTheme,
    title,
    text: message,
    input: "text",
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
  });
  if (result.isConfirmed) {
    return result.value;
  }
  return null;
};

export const showReasonPrompt = async (
  message,
  title = "Reason Required",
  confirmText = "Submit"
) => {
  const result = await Swal.fire({
    ...lightTheme,
    title,
    text: message,
    input: "textarea",
    inputPlaceholder: "Enter reason...",
    inputValidator: (value) =>
      !value || !value.trim() ? "A reason is required." : undefined,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "Cancel",
    reverseButtons: true,
  });
  if (result.isConfirmed) {
    return result.value.trim();
  }
  return null;
};

// Predefined cancellation reasons — keep in sync with
// Appointment::CANCELLATION_REASONS on the backend.
export const CANCELLATION_REASONS = {
  client_request: "Client requested cancellation",
  client_no_show: "Client did not show up",
  veterinarian_unavailable: "Veterinarian unavailable",
  schedule_conflict: "Scheduling conflict",
  pet_not_fit: "Pet not fit for the appointment",
  duplicate_booking: "Duplicate or mistaken booking",
  other: "Other",
};

export const showCancellationReasonPrompt = async (
  message,
  title = "Cancellation Reason"
) => {
  const reasonStep = await Swal.fire({
    ...lightTheme,
    title,
    text: message,
    input: "select",
    inputOptions: CANCELLATION_REASONS,
    inputPlaceholder: "Select a reason...",
    inputValidator: (value) =>
      !value ? "Please select a cancellation reason." : undefined,
    showCancelButton: true,
    confirmButtonText: "Continue",
    cancelButtonText: "Cancel",
    reverseButtons: true,
  });

  if (!reasonStep.isConfirmed) {
    return null;
  }

  const code = reasonStep.value;
  if (code !== "other") {
    return { code, note: "" };
  }

  const explanationStep = await Swal.fire({
    ...lightTheme,
    title,
    text: "Please explain the reason for this cancellation.",
    input: "textarea",
    inputPlaceholder: "Enter explanation...",
    inputValidator: (value) =>
      !value || !value.trim() ? "An explanation is required." : undefined,
    showCancelButton: true,
    confirmButtonText: "Cancel Appointment",
    cancelButtonText: "Back",
    reverseButtons: true,
  });

  if (!explanationStep.isConfirmed) {
    return null;
  }

  return { code, note: explanationStep.value.trim() };
};
