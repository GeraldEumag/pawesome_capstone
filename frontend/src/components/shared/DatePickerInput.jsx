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
  withPortal = false,
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
      />
    </div>
  );
};

export default DatePickerInput;
