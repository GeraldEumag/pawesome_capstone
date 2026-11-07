import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

const BASE_DEFAULTS = { tab: "all" };

/**
 * Reads and writes the booking list's stage tab and date preset in the URL
 * (?tab=to_pay&range=7d). Default values are omitted from the URL.
 */
export const useBookingViewParams = ({ defaultRange = "today" } = {}) => {
  const navigate = useNavigate();
  const DEFAULTS = { ...BASE_DEFAULTS, range: defaultRange };

  const searchParams = new URLSearchParams(window.location.search);
  const tab = searchParams.get("tab") || DEFAULTS.tab;
  const range = searchParams.get("range") || DEFAULTS.range;

  const update = useCallback(
    (patch) => {
      // Read the URL at call time: two quick updates (date, then stage) must
      // not overwrite each other with a stale snapshot from the last render.
      const current = new URLSearchParams(window.location.search);
      const next = new URLSearchParams(current);
      const merged = {
        tab: current.get("tab") || DEFAULTS.tab,
        range: current.get("range") || DEFAULTS.range,
        ...patch,
      };
      Object.entries(merged).forEach(([key, value]) => {
        if (value === DEFAULTS[key]) next.delete(key);
        else next.set(key, value);
      });
      navigate({ search: next.toString() }, { replace: true });
    },
    [navigate, defaultRange]
  );

  return {
    tab,
    range,
    setTab: (value) => update({ tab: value }),
    setRange: (value) => update({ range: value }),
    setView: update,
  };
};

export default useBookingViewParams;
