const { chromium, request: pwRequest } = require('playwright');
const path = require('path');
(async () => {
  const req = await pwRequest.newContext();
  const res = await req.post('http://127.0.0.1:8000/api/auth/login', { data: { email: 'vet@example.com', password: 'Password123!' } });
  const { token, user } = await res.json();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token); localStorage.setItem('role', user.role);
    localStorage.setItem('name', user.name); localStorage.setItem('username', user.username || user.email);
    localStorage.setItem('email', user.email);
  }, { token, user });
  for (const id of [1, 5, 6, 7, 9]) {
    await page.goto(`http://127.0.0.1:3000/veterinary/appointments/${id}/consult`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const hasEditor = await page.locator('text=/Save Draft|Finalize|Consultation/i').first().count();
    console.log(`id=${id} editorMarkers=${hasEditor} url=${page.url()}`);
    if (hasEditor && !page.url().endsWith('/appointments')) {
      await page.screenshot({ path: path.resolve('docs/user-manual/screenshots/UM-021-vet-consultation.png') });
      console.log('captured UM-021');
      break;
    }
  }
  await browser.close();
})();
