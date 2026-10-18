import React from "react";
import "./BookingDateFilter.css";

/**
 * Segmented date-preset control for booking lists.
 *
 *   <BookingDateFilter presets={DATE_PRESETS} value="today" range={range} onChange={setPreset} />
 */
const BookingDateFilter = ({ presets, value, range, onChange, ariaLabel = "Filter bookings by date" }) => (
  <div className="bdf-wrap">
    <div className="bdf-segment" role="group" aria-label={ariaLabel}>
      {presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          aria-pressed={preset.key === value}
          className={`bdf-option${preset.key === value ? " is-active" : ""}`}
          onClick={() => onChange(preset.key)}
        >
          {preset.label}
        </button>
      ))}
    </div>
    {range && (
      <small className="bdf-range">
        {range.from === range.to ? range.from : `${range.from} to ${range.to}`}
      </small>
    )}
  </div>
);

export default BookingDateFilter;
