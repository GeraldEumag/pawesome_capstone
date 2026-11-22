import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3000', API='http://127.0.0.1:8000/api';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const login = await page.request.post(`${API}/auth/login`, { data:{login:'receptionist@example.com',password:'Password123!'}, headers:{Accept:'application/json'}});
const auth = await login.json();
await page.addInitScript(({token,user})=>{localStorage.setItem('token',token);localStorage.setItem('role',user.role);localStorage.setItem('name',user.name);localStorage.setItem('username',user.email);localStorage.setItem('email',user.email);},{token:auth.token,user:auth.user});
await page.goto(`${BASE}/receptionist/walk-ins`,{waitUntil:'networkidle'});
await page.waitForTimeout(1200);
await page.locator('.service-card',{hasText:'Veterinary'}).locator('.svc-cta-btn').click();
await page.waitForTimeout(1200);
await page.locator('.mode-card',{hasText:'Existing Customer'}).click();
await page.waitForTimeout(300);
await page.locator('.hbk-foot .primary-btn').click();
await page.waitForTimeout(1800);
const search = page.locator('.walkin-search-box input');
await search.click(); await search.pressSequentially('customer',{delay:50});
const items = page.locator('.customer-result-item');
await items.first().waitFor({state:'visible',timeout:15000}).catch(()=>{});
if (await items.count()) { await items.first().click(); await page.waitForTimeout(900); }
const petSel = page.locator('.hbk-body select').first();
if (await petSel.count()) { const o=await petSel.locator('option').allTextContents(); if(o.length>1){await petSel.selectOption({index:1});await page.waitForTimeout(300);} }
await page.locator('.hbk-foot .primary-btn').click();
await page.waitForTimeout(2800);

// capture the walk-ins POST
page.on('request', r => { if (r.url().includes('/walk-ins') && r.method()==='POST') console.log('POST BODY:', r.postData()); });
page.on('response', async r => { if (r.url().includes('/walk-ins') && r.method()==='POST') console.log('POST RESP:', r.status(), (await r.text()).slice(0,400)); });

// fill booking details
const body = page.locator('.hbk-body');
// service select = first select
const svcSel = body.locator('select').nth(0);
await svcSel.selectOption({ index: 1 });
await page.waitForTimeout(300);
// date picker - find the date input
const dateInput = body.locator('input').first();
console.log('date input type:', await dateInput.getAttribute('type'), 'placeholder:', await dateInput.getAttribute('placeholder'));
// DatePickerInput - try typing a date
await dateInput.click();
await page.waitForTimeout(600);
await page.screenshot({path:'C:/xampp/htdocs/Pawesome/browser-evidence/vet-walkin-repro/date-picker.png'});
// find available day cell in the datepicker popup
const dayCell = page.locator('.react-datepicker__day:not(.react-datepicker__day--outside-month):not(.react-datepicker__day--disabled)').nth(10);
if (await dayCell.count()) { await dayCell.click(); console.log('picked day cell'); }
await page.waitForTimeout(2500);
// time select
const timeSel = body.locator('select').nth(1);
const timeOpts = await timeSel.locator('option').allTextContents();
console.log('time options:', JSON.stringify(timeOpts.slice(0,8)));
if (timeOpts.length>1) await timeSel.selectOption({index:1});
// vet select
const vetSel = body.locator('select').nth(2);
const vetOpts = await vetSel.locator('option').allTextContents();
console.log('vet options:', JSON.stringify(vetOpts));
if (vetOpts.length>1) { await vetSel.selectOption({index:1}); await page.waitForTimeout(2500); }
// reason
const reasonTa = body.locator('textarea').first();
await reasonTa.fill('Checkup for repro');
await page.screenshot({path:'C:/xampp/htdocs/Pawesome/browser-evidence/vet-walkin-repro/filled-form.png'});
// submit
await page.locator('.hbk-foot .primary-btn').click();
await page.waitForTimeout(1500);
await page.screenshot({path:'C:/xampp/htdocs/Pawesome/browser-evidence/vet-walkin-repro/review-modal.png'});
console.log('review text:', (await page.locator('body').innerText()).match(/Review|Confirm|Veterinarian|Create Booking/g)?.slice(0,10));
// confirm in review modal if present
const confirmBtn = page.locator('button',{hasText:/Confirm|Create Booking|Submit/i}).last();
if (await confirmBtn.count()) { await confirmBtn.click(); await page.waitForTimeout(3000); }
await page.screenshot({path:'C:/xampp/htdocs/Pawesome/browser-evidence/vet-walkin-repro/after-submit.png'});
console.log('FINAL TEXT:', (await page.locator('body').innerText()).slice(0,600));
await browser.close();
