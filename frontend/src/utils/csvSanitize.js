/**
 * CSV formula-injection sanitizer.
 *
 * Excel (and other spreadsheet apps) evaluate cell values that begin with
 * =, +, -, @, tab, or carriage return as formulas when a CSV file is opened.
 * Since exported reports can contain user-controlled text (customer names,
 * pet names, item names, diagnoses, notes), prefix such values with a single
 * quote so they render literally instead of executing.
 *
 * Only applies to CSV exports: SheetJS (xlsx) writes string cells, which are
 * never interpreted as formulas, so xlsx paths do not need this.
 */
const FORMULA_PREFIX = /^[\s]*[=+\-@\t\r]/;

export const sanitizeCsvCell = (value) => {
  if (typeof value !== 'string') return value;
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
};

export const sanitizeCsvRow = (row) =>
  Array.isArray(row) ? row.map(sanitizeCsvCell) : row;

export const sanitizeCsvRecords = (records) =>
  records.map((record) =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, sanitizeCsvCell(value)])
    )
  );
