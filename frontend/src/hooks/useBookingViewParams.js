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
          // Merge with the CURRENT values — patching one key must not
          // reset the other (previously a date change wiped the stage tab
          // and a tab change reset the date to today).
          const merged = {
            tab: current.get("tab") || DEFAULTS.tab,
            range: current.get("range") || DEFAULTS.range,
            ...patch,
          };
          Object.entries(merged).forEach(([key, value]) => {
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
