import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./DatePickerInput.css";

const DatePickerInput = ({
  selected,
  onChange,
  placeholderText = "Select a date...",
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
  showYearDropdown = true,
  scrollableYearDropdown = true,
  yearDropdownItemNumber = 100,
}) => {
  return (
    <div className={`paws-datepicker-wrap ${className}`}>
      <DatePicker
        id={id}
        selected={selected}
        onChange={onChange}
        placeholderText={placeholderText}
        minDate={minDate}
        maxDate={maxDate}
        dateFormat={showTimeSelect ? `${dateFormat} ${timeFormat}` : dateFormat}
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
      />
    </div>
  );
};

export default DatePickerInput;
