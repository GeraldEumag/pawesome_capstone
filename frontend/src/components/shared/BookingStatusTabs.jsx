import React, { useRef } from "react";
import "./BookingStatusTabs.css";

/**
 * Stage tabs for booking lists. Arrow keys move focus between tabs.
 *
 *   <BookingStatusTabs tabs={BOOKING_TABS} active="all" counts={counts} onChange={setTab} />
 */
const BookingStatusTabs = ({ tabs, active, counts = {}, onChange, ariaLabel = "Filter bookings by stage" }) => {
  const refs = useRef([]);

  const handleKeyDown = (event, index) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const last = tabs.length - 1;
    const next =
      event.key === "Home" ? 0
        : event.key === "End" ? last
          : event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
            : (index === 0 ? last : index - 1);
    refs.current[next]?.focus();
    onChange(tabs[next].key);
  };

  return (
    <div className="bst-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="tab"
            id={`bst-tab-${tab.key}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`bst-tab${selected ? " is-active" : ""}`}
            title={tab.title || undefined}
            aria-label={tab.title ? `${tab.title} (${counts[tab.key] ?? 0})` : undefined}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span>{tab.label}</span>
            <span className="bst-count">{counts[tab.key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
};

export default BookingStatusTabs;
