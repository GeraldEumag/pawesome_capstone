import { describe, expect, it } from "vitest";
import { countByTab, getDateRange, getServiceDate, matchesDatePreset } from "./bookingTabs";

describe("hotel booking store-date filtering", () => {
  it("keeps a scheduled paid boarding returned as a calendar date in today's on-going tab", () => {
    const storeToday = "2026-11-19";
    const boarding = {
      id: 88,
      status: "scheduled",
      payment_status: "paid",
      workflow_stage: "on_going",
      check_in: "2026-11-19",
      check_out: "2026-11-19",
    };
    const todayRange = getDateRange("today", storeToday);

    expect(getServiceDate(boarding)).toBe(storeToday);
    expect(matchesDatePreset(boarding, "today", todayRange, storeToday, { carryLiveStays: true })).toBe(true);
    expect(countByTab([boarding]).on_going).toBe(1);
  });

  it("does not include a scheduled booking outside today's date range", () => {
    const storeToday = "2026-11-19";
    const tomorrow = {
      status: "scheduled",
      workflow_stage: "on_going",
      check_in: "2026-11-20",
      check_out: "2026-11-20",
    };

    expect(matchesDatePreset(tomorrow, "today", getDateRange("today", storeToday), storeToday)).toBe(false);
  });
});
