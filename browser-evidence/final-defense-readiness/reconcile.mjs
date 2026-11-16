const API = "http://127.0.0.1:8001/api";
const { execSync } = await import("node:child_process");
const sql = (q) => { try { return execSync(`"C:/xampp/mysql/bin/mysql.exe" -u root pawesome_e2e_audit -N -e "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8", stdio: ["ignore","pipe","pipe"] }).trim(); } catch (e) { return "ERR:" + (e.stderr?.toString()||e.message).slice(0,150); } };
async function login(email, password) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const j = await r.json(); return j.token || j.access_token || j.data?.token;
}
const t = { manager: await login("manager@example.com", "password123"), cashier: await login("cashier@example.com", "password123"), admin: await login("admin@example.com", "Password123!") };
const api = async (role, path) => { const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t[role]}`, Accept: "application/json" } }); let j=null; try{ j=await r.json(); }catch{} return { status: r.status, j }; };

const D = "2026-11-16"; // app-date of probe runs (UTC)
const out = {};

// --- SQL ground truth for date D ---
out.sql_sales_total   = sql(`SELECT IFNULL(SUM(total_amount),0) FROM sales WHERE status='completed' AND DATE(created_at)='${D}'`);
out.sql_sales_count   = sql(`SELECT COUNT(*) FROM sales WHERE status='completed' AND DATE(created_at)='${D}'`);
out.sql_sr_paid_total = sql(`SELECT IFNULL(SUM(price),0) FROM service_requests WHERE payment_status='paid' AND DATE(paid_at)='${D}'`);
out.sql_sr_paid_count = sql(`SELECT COUNT(*) FROM service_requests WHERE payment_status='paid' AND DATE(paid_at)='${D}'`);
out.sql_inv_deductions= sql(`SELECT COUNT(*) FROM inventory_logs WHERE type='deduction' AND DATE(created_at)='${D}'`);
out.sql_payments      = sql(`SELECT IFNULL(SUM(amount),0), COUNT(*) FROM payments WHERE status='completed' AND DATE(paid_at)='${D}'`);

// --- Manager reports ---
const sales = await api("manager", `/manager/reports/sales?start_date=${D}&end_date=${D}`);
const pays  = await api("manager", `/manager/reports/payments?start_date=${D}&end_date=${D}`);
const over  = await api("manager", `/manager/reports/overview?start_date=${D}&end_date=${D}`);
out.report_sales_status = sales.status;
out.report_sales_keys   = sales.j ? Object.keys(sales.j).slice(0,15) : null;
// try to find totals in common shapes
const findNums = (o, path="") => { const hits=[]; if (o&&typeof o==="object") for (const [k,v] of Object.entries(o)) { const p=path?`${path}.${k}`:k; if (typeof v==="number") hits.push([p,v]); else if (typeof v==="object"&&v!==null) hits.push(...findNums(v,p)); } return hits; };
out.sales_nums = sales.j ? findNums(sales.j).filter(([p]) => /total|amount|revenue|sales/i.test(p)).slice(0,12) : null;
out.pays_nums  = pays.j  ? findNums(pays.j ).filter(([p]) => /total|amount|count|paid/i.test(p)).slice(0,12) : null;
out.over_nums  = over.j  ? findNums(over.j ).filter(([p]) => /total|amount|revenue|sales|paid/i.test(p)).slice(0,15) : null;

// --- Cashier transaction history ---
const hist = await api("cashier", `/cashier/pos/transactions?date=${D}`);
out.cashier_hist_status = hist.status;
out.cashier_hist_count = Array.isArray(hist.j) ? hist.j.length : (hist.j?.data?.length ?? hist.j?.transactions?.length ?? null);

await import("node:fs").then(fs => fs.writeFileSync("evidence/reconcile-results.json", JSON.stringify(out, null, 2)));
console.log(JSON.stringify(out, null, 2));
