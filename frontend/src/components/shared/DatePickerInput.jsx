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
  dateFormat = "dd/MM/yy",
  disabled = false,
  readOnly = true,
  strictParsing = true,
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
  return (
    <div className={`paws-datepicker-wrap ${className}`}>
      <DatePicker
        id={id}
        ariaLabel={ariaLabel}
        selected={selected}
        onChange={onChange}
        placeholderText={placeholderText}
        minDate={minDate}
        maxDate={maxDate}
        dateFormat={showTimeSelect ? `${dateFormat} ${timeFormat}` : dateFormat}
        disabled={disabled}
        readOnly={readOnly}
        strictParsing={strictParsing}
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
