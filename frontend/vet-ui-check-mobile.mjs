import { chromium } from 'playwright';
const BASE='http://127.0.0.1:3000', API='http://127.0.0.1:8000/api';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // common laptop
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
// geometry dump
const info = await page.evaluate(() => {
  const modal = document.querySelector('.hbk-modal');
  const body = document.querySelector('.hbk-body');
  const foot = document.querySelector('.hbk-foot');
  const r = (el)=>{ if(!el) return null; const b=el.getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),bottom:Math.round(b.bottom),right:Math.round(b.right)}; };
  const vetLabel=[...document.querySelectorAll('.hbk-body label')].find(l=>/Veterinarian/i.test(l.textContent));
  const vetSelect = vetLabel ? vetLabel.parentElement.querySelector('select') : null;
  return {
    viewport:{w:innerWidth,h:innerHeight},
    modal:r(modal), body:r(body), foot:r(foot), vetSelect:r(vetSelect),
    bodyScroll:{sh:body?.scrollHeight, ch:body?.clientHeight, canScroll: body? body.scrollHeight>body.clientHeight:false},
    vetVisible: vetSelect ? !!(vetSelect.offsetWidth||vetSelect.offsetHeight) : null,
    vetDisabled: vetSelect?.disabled,
  };
});
console.log(JSON.stringify(info,null,1));
await page.screenshot({path:'C:/xampp/htdocs/Pawesome/browser-evidence/vet-walkin-repro/geom-mobile.png'});
await browser.close();
