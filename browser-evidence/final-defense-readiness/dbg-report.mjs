const API = "http://127.0.0.1:8001/api";
const login = async (e,p) => (await (await fetch(`${API}/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})})).json()).token;
const t = await login("manager@example.com","password123");
const get = async (p) => { const r = await fetch(`${API}${p}`,{headers:{Authorization:`Bearer ${t}`,Accept:"application/json"}}); return {s:r.status, j: await r.json()}; };
for (const p of [
  "/manager/reports/sales?start_date=2026-11-16&end_date=2026-11-16",
  "/manager/reports/sales?from=2026-11-16&to=2026-11-16",
  "/manager/reports/sales?start_date=2026-11-01&end_date=2026-11-30",
  "/manager/reports/sales",
]) {
  const r = await get(p);
  console.log(p, "=>", r.s, "sales.len:", r.j?.data?.sales?.length, "msg:", r.j?.message, "rev:", r.j?.data?.summary?.total_revenue);
}
