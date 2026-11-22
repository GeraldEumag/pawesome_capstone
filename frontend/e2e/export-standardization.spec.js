const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const frontendUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';

const sampleRows = [
  { name: 'Bella, Jr.', amount: 1250.5, note: 'regular "client"' },
  { name: '=cmd|/C calc!A0', amount: -40, note: 'formula attempt' },
  { name: 'Señor Whiskers', amount: 0, note: 'unicode ñ test' },
];
const sampleColumns = [
  { key: 'name', label: 'Name' },
  { key: 'amount', label: 'Amount' },
  { key: 'note', label: 'Note' },
];

const downloadCsv = async (page, metadata) => {
  const event = page.waitForEvent('download');
  await page.evaluate(async (meta) => {
    const { exportToCSV } = await import('/src/utils/reportExport.js');
    const { sampleRows, sampleColumns } = window.__exportSamples;
    exportToCSV(sampleRows, sampleColumns, 'standardization-test', meta);
  }, metadata);
  const download = await event;
  const path = await download.path();
  return { filename: download.suggestedFilename(), content: await fs.readFile(path, 'utf8') };
};

test.describe('Export standardization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(frontendUrl);
    await page.evaluate(({ rows, cols }) => {
      window.__exportSamples = { sampleRows: rows, sampleColumns: cols };
    }, { rows: sampleRows, cols: sampleColumns });
  });

  test('formal CSV keeps letterhead; data CSV emits headers and rows only', async ({ page }) => {
    const formal = await downloadCsv(page, { title: 'Standardization Test' });
    expect(formal.filename).toMatch(/^pawesome_standardization-test_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(formal.content).toContain('Pawesome Retreat Inc.');
    expect(formal.content).toContain('Bella, Jr.');
    expect(formal.content).toContain('CERTIFICATION');

    const data = await downloadCsv(page, { csvStyle: 'data' });
    expect(data.filename).toMatch(/^pawesome_standardization-test_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(data.content.startsWith('﻿')).toBe(true);
    const lines = data.content.split('\r\n').filter((line) => line.length > 0);
    // headers + 3 records, nothing else
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('﻿Name,Amount,Note');
    expect(data.content).not.toContain('Pawesome Retreat Inc.');
    expect(data.content).not.toContain('CERTIFICATION');
    // CSV escaping, unicode, and formula-injection sanitization still apply
    expect(data.content).toContain('"Bella, Jr."');
    expect(data.content).toContain('Señor Whiskers');
    expect(data.content).toContain("'=cmd|/C calc!A0");
    expect(data.content).toContain('-40');
  });

  test('formal CSV without sign-off drops findings, certification, and signatures', async ({ page }) => {
    const noSignoff = await downloadCsv(page, { signoff: false });
    expect(noSignoff.content).toContain('Pawesome Retreat Inc.');
    expect(noSignoff.content).not.toContain('CERTIFICATION & SIGNATURES');
    expect(noSignoff.content).not.toContain('FINDINGS & RECOMMENDATIONS');
    expect(noSignoff.content).toContain('For authorized business use');
  });

  test('formal PDF resolves with a document containing the brand logo and footer paging', async ({ page }) => {
    const download = page.waitForEvent('download');
    const result = await page.evaluate(async () => {
      const { exportFormalReportPDF } = await import('/src/utils/formalReportPdf.js');
      const { sampleRows, sampleColumns } = window.__exportSamples;
      const doc = await exportFormalReportPDF({
        title: 'Standardization Audit',
        periodLabel: '2026-11-01 to 2026-11-22',
        signoff: false,
        table: {
          title: 'Records',
          columns: sampleColumns.map((c) => ({ header: c.label, key: c.key })),
          rows: sampleRows,
        },
        filename: 'standardization-pdf-test',
      });
      if (!doc) return { ok: false };
      const raw = doc.output('datauristring');
      const binary = atob(raw.slice(raw.indexOf('base64,') + 7));
      const { loadBrandLogo } = await import('/src/utils/brandAssets.js');
      const logo = await loadBrandLogo();
      return {
        ok: true,
        pages: doc.getNumberOfPages(),
        logoLoaded: typeof logo === 'string' && logo.startsWith('data:image'),
        hasImage: binary.includes('/Subtype /Image') || binary.includes('/Subtype/Image'),
        byteLength: raw.length,
      };
    });
    expect(result.ok).toBe(true);
    expect(result.pages).toBeGreaterThanOrEqual(1);
    expect(result.logoLoaded).toBe(true);
    expect(result.hasImage).toBe(true);
    const dl = await download;
    expect(dl.suggestedFilename()).toBe('standardization-pdf-test.pdf');
  });

  test('normalizeExportFilename prefixes pawesome_ without duplicating it', async ({ page }) => {
    const names = await page.evaluate(async () => {
      const { normalizeExportFilename } = await import('/src/utils/reportExport.js');
      return ['report', 'pawesome_existing', 'Pawesome-Retreat-Inc.-audit', ''].map(normalizeExportFilename);
    });
    expect(names[0]).toBe('pawesome_report');
    expect(names[1]).toBe('pawesome_existing');
    expect(names[2]).toBe('Pawesome-Retreat-Inc.-audit');
    expect(names[3]).toBe('pawesome_report');
  });
});
