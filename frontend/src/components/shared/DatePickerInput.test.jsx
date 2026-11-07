import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DatePickerInput from "./DatePickerInput";

afterEach(cleanup);

const getInput = (container) => container.querySelector(".paws-datepicker-wrap input");

describe("DatePickerInput", () => {
  it("renders an input with the typing-format placeholder", () => {
    const { container } = render(<DatePickerInput selected={null} onChange={() => {}} />);
    expect(getInput(container)).toHaveAttribute("placeholder", "mm/dd/yyyy");
  });

  it("uses placeholderText when provided", () => {
    const { container } = render(
      <DatePickerInput selected={null} onChange={() => {}} placeholderText="Choose a date" />
    );
    expect(getInput(container)).toHaveAttribute("placeholder", "Choose a date");
  });

  it("renders helperText", () => {
    render(<DatePickerInput selected={null} onChange={() => {}} helperText="Pick a weekday" />);
    expect(screen.getByText("Pick a weekday")).toBeInTheDocument();
  });

  it("disables the input when disabled", () => {
    const { container } = render(<DatePickerInput selected={null} onChange={() => {}} disabled />);
    expect(getInput(container)).toBeDisabled();
  });

  it("marks the input required when required", () => {
    const { container } = render(<DatePickerInput selected={null} onChange={() => {}} required />);
    expect(getInput(container)).toBeRequired();
  });

  it("displays the selected date in the long format", () => {
    const { container } = render(
      <DatePickerInput selected={new Date(2026, 0, 15)} onChange={() => {}} />
    );
    expect(getInput(container)).toHaveValue("January 15, 2026");
  });

  it("accepts an onChange handler without errors", () => {
    const { container } = render(<DatePickerInput selected={null} onChange={vi.fn()} />);
    expect(getInput(container)).toBeInTheDocument();
  });
});
