import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import usePolling from "./usePolling";

const POLL_MS = 30000;

/**
 * Customer bookings from GET /customer/bookings. Refreshes every 30 s while
 * the tab is visible, on window focus, and when `refresh()` is called after
 * an action. `service` is "hotel" | "grooming" | "vet" or "" for all.
 */
export const useCustomerBookings = ({ service = "", range = "upcoming" } = {}) => {
  const [state, setState] = useState({ items: [], counts: {}, storeToday: "", loading: true, error: "" });
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ range });
    if (service) params.set("service", service);
    try {
      const res = await apiRequest(`/customer/bookings?${params.toString()}`);
      setState({
        items: Array.isArray(res?.items) ? res.items : [],
        counts: res?.counts || {},
        storeToday: res?.store_today || "",
        loading: false,
        error: "",
      });
      setUpdatedAt(new Date());
    } catch (err) {
      setState((current) => ({ ...current, loading: false, error: err.message || "Could not load your bookings." }));
    }
  }, [service, range]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const poll = useCallback(() => {
    if (document.visibilityState !== "hidden") load();
  }, [load]);
  usePolling(poll, POLL_MS);

  return { ...state, updatedAt, refresh: load };
};

export default useCustomerBookings;
