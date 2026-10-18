import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";
import { formatDateOnly, parseDateOnly } from "../utils/date";

/**
 * Public holidays that customers cannot book, for the next year.
 * Returns Date objects for react-datepicker's excludeDates and the
 * matching names for hints. Fails open (no exclusions) if the request fails;
 * the server still rejects holiday bookings.
 */
export const useBlockedHolidays = () => {
  const [holidays, setHolidays] = useState([]);

  useEffect(() => {
    const today = new Date();
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    const query = `from=${formatDateOnly(today)}&to=${formatDateOnly(end)}`;

    apiRequest(`/holidays/blocked?${query}`)
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        setHolidays(
          list
            .map((item) => ({ date: parseDateOnly(item.date), name: item.name }))
            .filter((item) => item.date)
        );
      })
      .catch(() => setHolidays([]));
  }, []);

  const upcoming = holidays.slice(0, 3);
  const hint = upcoming.length
    ? `Closed on public holidays: ${upcoming
      .map((item) => `${item.name} (${item.date.toLocaleDateString("en-PH", { month: "short", day: "numeric" })})`)
      .join(", ")}`
    : "";

  return {
    excludeDates: holidays.map((item) => item.date),
    upcoming,
    hint,
  };
};

export default useBlockedHolidays;
