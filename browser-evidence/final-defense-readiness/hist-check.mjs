const API = "http://127.0.0.1:8001/api";
const login = async (e,p) => (await (await fetch(`${API}/auth/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})})).json()).token;
const t = await login("cashier@example.com","password123");
for (const p of ["/cashier/pos/transactions","/cashier/pos/transactions?date=2026-11-16&per_page=100","/cashier/pos/transactions?page=2"]) {
  const r = await fetch(`${API}${p}`,{headers:{Authorization:`Bearer ${t}`,Accept:"application/json"}});
  const j = await r.json();
  const arr = Array.isArray(j) ? j : (j.data ?? j.transactions ?? j.sales ?? []);
  console.log(p, r.status, "len:", arr.length, "meta:", JSON.stringify(j.meta ?? j.pagination ?? j.last_page ?? "none").slice(0,120));
}
