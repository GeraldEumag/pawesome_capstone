import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

const BASE_DEFAULTS = { tab: "all" };

/**
 * Reads and writes the booking list's stage tab and date preset in the URL
 * (?tab=to_pay&range=7d). Default values are omitted from the URL.
 */
export const useBookingViewParams = ({ defaultRange = "today" } = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const DEFAULTS = { ...BASE_DEFAULTS, range: defaultRange };

  const tab = searchParams.get("tab") || DEFAULTS.tab;
  const range = searchParams.get("range") || DEFAULTS.range;

  const update = useCallback(
    (patch) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries({ ...DEFAULTS, ...patch }).forEach(([key, value]) => {
            if (value === DEFAULTS[key]) next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, defaultRange]
  );

  return {
    tab,
    range,
    setTab: (value) => update({ tab: value }),
    setRange: (value) => update({ range: value }),
  };
};

export default useBookingViewParams;
