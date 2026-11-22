import { beforeEach, describe, expect, it, vi } from "vitest";

// The jsPDF pipeline is heavy for a unit test — stub the public entry point
// and verify callers/options propagation separately.
vi.mock("./formalReportPdf", () => ({
  exportFormalReportPDF: vi.fn(async (config) => config),
}));

import {
  exportToCSV,
  exportToPDF,
  normalizeExportFilename,
} from "./reportExport";
import { exportFormalReportPDF } from "./formalReportPdf";
import { sanitizeCsvCell } from "./csvSanitize";
import { loadBrandLogo } from "./brandAssets";
import { STORE_INFO } from "./storeInfo";

const DATA = [
  { name: "Alice", amount: 1250.5, when: "2026-11-01" },
  { name: "Bob", amount: -500, when: "2026-11-02" },
];
const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount", format: "currency" },
  { key: "when", label: "Date", format: "date" },
];

const captured = { blobs: [], downloads: [] };

beforeEach(() => {
  captured.blobs = [];
  captured.downloads = [];
  vi.clearAllMocks();
  const NativeBlob = window.Blob;
  vi.stubGlobal(
    "Blob",
    class extends NativeBlob {
      constructor(parts, options) {
        super(parts, options);
        captured.blobs.push(parts);
      }
    },
  );
  vi.stubGlobal(
    "URL",
    Object.assign(window.URL || {}, {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    }),
  );
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    captured.downloads.push(this.download);
  };
  return () => {
    HTMLAnchorElement.prototype.click = click;
  };
});

const csvText = () => captured.blobs[0][0];

describe("normalizeExportFilename", () => {
  it("applies the pawesome_ prefix", () => {
    expect(normalizeExportFilename("sales-report")).toBe("pawesome_sales-report");
  });
  it("does not double-prefix pawesome names", () => {
    expect(normalizeExportFilename("pawesome_sales")).toBe("pawesome_sales");
    expect(normalizeExportFilename("Pawesome-Report")).toBe("Pawesome-Report");
  });
  it("strips file extensions before prefixing", () => {
    expect(normalizeExportFilename("report.csv")).toBe("pawesome_report");
  });
  it("falls back to pawesome_report for empty input", () => {
    expect(normalizeExportFilename("")).toBe("pawesome_report");
  });
});

describe("exportToCSV — data-only mode", () => {
  it("emits only headers and data rows (no letterhead/certification)", () => {
    exportToCSV(DATA, COLUMNS, "list-report", { csvStyle: "data" });
    const text = csvText();
    const lines = text.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 records
    expect(lines[0]).toBe("Name,Amount,Date");
    expect(text).not.toContain(STORE_INFO.name);
    expect(text).not.toContain("CERTIFICATION");
    expect(text).not.toContain("FINDINGS");
  });

  it("keeps the UTF-8 BOM and pawesome_ filename", () => {
    exportToCSV(DATA, COLUMNS, "list-report", { csvStyle: "data" });
    expect(csvText().charCodeAt(0)).toBe(0xfeff);
    expect(captured.downloads[0]).toMatch(/^pawesome_list-report_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe("exportToCSV — formal modes", () => {
  it("emits letterhead, doc control, summary, and certification by default", () => {
    exportToCSV(DATA, COLUMNS, "payroll-report");
    const text = csvText();
    expect(text).toContain(STORE_INFO.name);
    expect(text).toContain("Document Reference");
    expect(text).toContain("REPORT SUMMARY");
    expect(text).toContain("CERTIFICATION & SIGNATURES");
    expect(text).toContain("Prepared by");
    expect(text).toContain("Reviewed by");
    expect(text).toContain("Approved by");
  });

  it("suppresses findings/certification but keeps letterhead with signoff:false", () => {
    exportToCSV(DATA, COLUMNS, "list-report", { signoff: false });
    const text = csvText();
    expect(text).toContain(STORE_INFO.name);
    expect(text).toContain("Document Reference");
    expect(text).not.toContain("CERTIFICATION & SIGNATURES");
    expect(text).not.toContain("FINDINGS & RECOMMENDATIONS");
    expect(text).toContain("For authorized business use");
  });

  it("propagates an accurate reporting period", () => {
    exportToCSV(DATA, COLUMNS, "filtered-report", {
      csvStyle: "formal",
      signoff: false,
      periodLabel: "2026-10-01 to 2026-10-31",
    });
    expect(csvText()).toContain("2026-10-01 to 2026-10-31");
  });
});

describe("CSV formula-injection protection", () => {
  it.each(["=SUM(A1)", "+cmd", "-2+3", "@danger", "\t=1", "\r=1"])(
    "prefixes %j with a quote",
    (value) => {
      expect(sanitizeCsvCell(value)).toBe(`'${value}`);
    },
  );
  it("does not corrupt legitimate numeric negatives", () => {
    expect(sanitizeCsvCell(-500)).toBe(-500);
    exportToCSV(DATA, COLUMNS, "neg-report", { csvStyle: "data" });
    expect(csvText()).toContain("-₱500.00");
  });
  it("escapes quotes and commas inside cells", () => {
    exportToCSV([{ name: 'A, "B"' }], COLUMNS.slice(0, 1), "esc-report", {
      csvStyle: "data",
    });
    expect(csvText()).toContain('"A, ""B"""');
  });
});

describe("exportToPDF — async propagation", () => {
  it("returns a promise and forwards options to the formal renderer", async () => {
    const result = exportToPDF(DATA, COLUMNS, "Report", "my-report", {
      signoff: false,
      periodLabel: "All time",
    });
    expect(result).toBeInstanceOf(Promise);
    await result;
    const config = exportFormalReportPDF.mock.calls[0][0];
    expect(config.signoff).toBe(false);
    expect(config.periodLabel).toBe("All time");
    expect(config.filename).toMatch(/^pawesome_my-report_/);
    expect(config.table.columns).toHaveLength(3);
  });

  it("keeps formal sign-off for default payroll-class reports", async () => {
    await exportToPDF(DATA, COLUMNS, "Payroll Report", "payroll-report");
    const config = exportFormalReportPDF.mock.calls[0][0];
    expect(config.signoff).not.toBe(false);
  });
});

describe("loadBrandLogo — graceful fallback", () => {
  it("resolves null instead of rejecting when the asset cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    await expect(loadBrandLogo()).resolves.toBeNull();
  });
});
