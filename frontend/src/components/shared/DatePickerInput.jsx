import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./DatePickerInput.css";

const DatePickerInput = ({
  selected,
  onChange,
  placeholderText,
  minDate,
  maxDate,
  excludeDates,
  helperText,
  dateFormat = "MMMM d, yyyy",
  disabled = false,
  required = false,
  showTimeSelect = false,
  timeFormat = "h:mm aa",
  timeIntervals = 30,
  className = "",
  id,
  ariaLabel,
  showYearDropdown = true,
  scrollableYearDropdown = true,
  yearDropdownItemNumber = 100,
  // Portal mode keeps the calendar in a full-screen overlay above modals,
  // so it is never clipped by `overflow: hidden` containers or hidden
  // behind modal overlays — the previous anchored popper became
  // unclickable inside booking modals after a date was selected.
  withPortal = true,
  // `portalId` makes react-datepicker mount the overlay through a real
  // React portal into a shared div appended to document.body. Without it
  // the overlay is rendered inline and `position: fixed` breaks whenever
  // an ancestor keeps a `transform` (e.g. the register card's entrance
  // animation with `animation-fill-mode: both`), leaving the calendar
  // offset and clipped.
  portalId = "paws-datepicker-portal",
}) => {
  const typingFormat = showTimeSelect ? `MM/dd/yyyy ${timeFormat}` : "MM/dd/yyyy";
  const displayFormat = showTimeSelect ? `${dateFormat} ${timeFormat}` : dateFormat;
  const formats = [...new Set([displayFormat, typingFormat])];
  const hint = placeholderText || typingFormat.toLowerCase();

  return (
    <div className={`paws-datepicker-wrap ${className}`}>
      <DatePicker
        id={id}
        ariaLabel={ariaLabel}
        selected={selected}
        onChange={onChange}
        placeholderText={hint}
        minDate={minDate}
        maxDate={maxDate}
        excludeDates={excludeDates}
        dateFormat={formats}
        disabled={disabled}
        required={required}
        showTimeSelect={showTimeSelect}
        timeFormat={timeFormat}
        timeIntervals={timeIntervals}
        showYearDropdown={showYearDropdown}
        scrollableYearDropdown={scrollableYearDropdown}
        yearDropdownItemNumber={yearDropdownItemNumber}
        wrapperClassName="paws-datepicker"
        calendarClassName="paws-datepicker-calendar"
        popperClassName="paws-datepicker-popper"
        popperPlacement="bottom-start"
        withPortal={withPortal}
        portalId={portalId}
        showDisabledMonthNavigation
      />
      {helperText && <small className="paws-datepicker-hint">{helperText}</small>}
    </div>
  );
};

export default DatePickerInput;
