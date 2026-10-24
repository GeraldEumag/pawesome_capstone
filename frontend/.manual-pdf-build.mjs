// One-off build: user-manual markdown -> styled HTML -> PDF via Playwright.
// Run from repo root: node frontend/.manual-pdf-build.mjs [input.md] [output.pdf]
// Defaults: docs/user-manual/PAWESOME_USER_MANUAL.md -> docs/user-manual/PAWESOME_USER_MANUAL.pdf
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manualDir = resolve(root, 'docs/user-manual');
const mdPath = resolve(root, process.argv[2] || 'docs/user-manual/PAWESOME_USER_MANUAL.md');
const pdfPath = resolve(root, process.argv[3] || 'docs/user-manual/PAWESOME_USER_MANUAL.pdf');
const slug = basename(mdPath).replace(/\.md$/i, '');
const bodyHtmlPath = resolve(manualDir, `.manual-body-${slug}.html`);
const pageHtmlPath = resolve(manualDir, `.manual-page-${slug}.html`);

// 1) Inject image embeds at the FIRST textual mention of each screenshot file.
const md = readFileSync(mdPath, 'utf8');
const seen = new Set();
const injected = md
  .split('\n')
  .map((line) => {
    const m = line.match(/UM-\d+[a-z]?-[a-z-]+\.png/g);
    if (!m) return line;
    const embeds = m
      .filter((f) => !seen.has(f))
      .map((f) => {
        seen.add(f);
        const label = f.replace(/\.png$/, '');
        return `\n\n![${label}](screenshots/${f})\n`;
      });
    return line + embeds.join('');
  })
  .join('\n');
console.log(`Embedded ${seen.size} screenshot references`);

// 2) MD -> body HTML via marked CLI (npx-cached; not a project dependency).
const tmpMd = resolve(manualDir, `.manual-injected-${slug}.md`);
writeFileSync(tmpMd, injected);
execSync(`npx -y marked --gfm -o "${bodyHtmlPath}"`, {
  input: readFileSync(tmpMd),
  stdio: ['pipe', 'inherit', 'inherit'],
  cwd: root,
});

// 3) Wrap in a print-styled page.
const body = readFileSync(bodyHtmlPath, 'utf8');
const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>Pawesome User Manual</title>
<style>
  @page { size: A4; margin: 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1f2430; max-width: 100%; }
  h1 { font-size: 20pt; border-bottom: 2.5px solid #d6336c; padding-bottom: 6px; page-break-before: always; }
  h1:first-of-type { page-break-before: avoid; }
  h2 { font-size: 14.5pt; color: #a61e4d; margin-top: 1.4em; page-break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 1.2em; page-break-after: avoid; }
  h4 { font-size: 11pt; page-break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.5pt; page-break-inside: auto; }
  th, td { border: 1px solid #c9ced6; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f3e6ee; }
  tr { page-break-inside: avoid; }
  code { font-family: Consolas, 'Courier New', monospace; font-size: 9pt; background: #f1f3f5; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f6f7f9; border: 1px solid #dee2e6; border-radius: 5px; padding: 9px 11px; font-size: 8.5pt; overflow-x: auto; page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d6336c; margin-left: 0; padding: 2px 12px; color: #444; background: #fdf2f7; }
  img { display: block; max-width: 100%; max-height: 88mm; object-fit: contain; border: 1px solid #ced4da; border-radius: 4px; margin: 8px auto; page-break-inside: avoid; }
  hr { border: none; border-top: 1px solid #adb5bd; margin: 18px 0; }
  ul, ol { padding-left: 22px; }
  a { color: #a61e4d; }
</style></head><body>
${body}
</body></html>`;
writeFileSync(pageHtmlPath, page);

// 4) Render to PDF with the project's Playwright Chromium.
const browser = await chromium.launch();
const pg = await browser.newPage();
await pg.goto('file:///' + pageHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
await pg.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' },
});
await browser.close();
console.log('PDF written:', pdfPath);
