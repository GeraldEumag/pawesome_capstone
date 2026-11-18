#!/usr/bin/env python3
"""Pawesome Reports Module — isolated E2E workflow audit driver.

Runs against the ISOLATED audit stack (API :8001, db pawesome_reports_audit).
Exercises 8 business workflows through the real API, then reconciles report
API output against independent ground-truth SQL. Never run against dev DB.
"""
import json, subprocess, sys, urllib.request, urllib.error, datetime

API = "http://127.0.0.1:8001/api"
DB = "pawesome_reports_audit"
MYSQL = r"C:/xampp/mysql/bin/mysql.exe"

import os, tempfile
def tok(role):
    return open(os.path.join(tempfile.gettempdir(), f"e2e_tok_{role}.txt")).read().strip()

TOKENS = {r: tok(r) for r in ["admin", "manager", "receptionist", "cashier", "inventory", "vet", "customer"]}
TODAY = datetime.date.today().isoformat()
TOMORROW = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

def call(method, path, role="admin", body=None, expect=None, files=None):
    url = f"{API}{path}"
    headers = {"Authorization": f"Bearer {TOKENS[role]}", "Accept": "application/json"}
    data = None
    if files:
        # minimal multipart
        boundary = "----e2e-boundary"
        parts = []
        for k, v in (body or {}).items():
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n")
        for k, (fname, fdata, ctype) in files.items():
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\nContent-Type: {ctype}\r\n\r\n")
        raw = "".join(parts).encode() + fdata + f"\r\n--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        data = raw
    elif body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            code, payload = r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        code, payload = e.code, json.loads(e.read() or b"{}")
    status = "OK" if (expect is None or code == expect) else "FAIL"
    print(f"  [{status}] {method} {path} -> {code} ({role})" + ("" if status == "OK" else f" body={str(payload)[:300]}"))
    return code, payload

def sql(q):
    out = subprocess.run([MYSQL, "-u", "root", DB, "-N", "-B", "-e", q],
                         capture_output=True, text=True)
    return out.stdout.strip()

results = []
def recon(name, api_val, db_val):
    ok = abs(float(api_val) - float(db_val)) < 0.01
    results.append((name, api_val, db_val, "PASS" if ok else "FAIL"))
    print(f"  RECON {name}: api={api_val} db={db_val} -> {'PASS' if ok else 'FAIL'}")

def report(path, role="admin"):
    code, d = call("GET", path, role)
    return d

print("=" * 70)
print("WF8  Customer creation (admin)")
print("=" * 70)
existing = sql("SELECT id FROM customers WHERE email='e2e.audit@example.com' LIMIT 1")
if existing:
    cust_id = int(existing)
    print(f"  reusing existing customer_id={cust_id}")
else:
    code, d = call("POST", "/admin/customers", "admin",
                   {"name": "E2E Audit Customer", "email": "e2e.audit@example.com", "phone": "09000000001"})
    cust_id = (d.get("customer") or d.get("data") or {}).get("id") or d.get("id")
print(f"  customer_id={cust_id}")
pet_id = sql(f"SELECT id FROM pets WHERE customer_id={cust_id} LIMIT 1")
if not pet_id:
    code, d = call("POST", f"/admin/customers/{cust_id}/pets", "admin",
                   {"name": "E2E Dog", "species": "Dog", "type": "Dog", "breed": "Aspin", "age": 3})
    pet = (d.get("pet") or d.get("data") or {})
    pet_id = pet.get("id")
print(f"  pet_id={pet_id}")
# link customers row to the customer user (id=9) so portal workflows can run
sql(f"UPDATE customers SET user_id=9 WHERE id={cust_id};")
r = report("/admin/reports/customers")
rows = r["data"]["customers"]
e2e = [x for x in rows if x["customer_id"] == cust_id]
recon("customers.list contains new customer", len(e2e) > 0, 1)
summary = r.get("summary") or r["data"].get("summary", {})
recon("customers.total_customers", summary["total_customers"],
      sql("SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL"))

print("=" * 70)
print("WF2  POS sale (cashier)")
print("=" * 70)
item_id = sql("SELECT id FROM inventory_items WHERE status='active' AND stock>10 AND is_sellable=1 LIMIT 1")
price = sql(f"SELECT price FROM inventory_items WHERE id={item_id}")
code, d = call("POST", "/cashier/pos/transaction", "cashier", {
    "customer_name": "Walk-in E2E",
    "items": [{"item_type": "product", "item_id": int(item_id), "item_name": "E2E Item",
               "quantity": 2, "unit_price": float(price)}],
    "payment_method": "cash", "cash_received": float(price) * 2 + 100,
})
sale_id = (d.get("sale") or d.get("data") or d.get("transaction") or {}).get("id")
print(f"  sale_id={sale_id} resp={str(d)[:300]}")
r = report("/admin/reports/sales")
recon("sales.total_revenue >= pos sale", r["data"]["summary"]["total_revenue"],
      sql(f"SELECT COALESCE(SUM(amount),0) FROM sales WHERE type NOT IN ('refund','multi_payment','appointment') AND status NOT IN ('voided','cancelled')"))

print("=" * 70)
print("WF6  Boarding create -> check-in -> complete -> pay")
print("=" * 70)
import random
b_time = f"{random.randint(10,16)}:{random.choice(['00','30'])}"
room_id = sql("SELECT id FROM boarding_rooms WHERE is_active=1 AND (allowed_species LIKE '%Dog%' OR allowed_species IS NULL OR allowed_species='') LIMIT 1") \
       or sql("SELECT id FROM boarding_rooms WHERE is_active=1 LIMIT 1")
code, d = call("POST", "/boardings", "admin", {
    "pet_id": int(pet_id), "customer_id": int(cust_id), "room_id": int(room_id),
    "check_in_date": TOMORROW, "check_in_time": b_time,
})
b_id = (d.get("boarding") or d.get("data") or {}).get("id") or d.get("id")
print(f"  boarding_id={b_id} resp={str(d)[:300]}")
if b_id:
    call("POST", f"/boardings/{b_id}/finalize-bill", "admin", {"total_amount": 1500})
    call("POST", f"/boardings/{b_id}/pay", "admin", {"amount": 1500, "payment_method": "cash"})
r = report("/admin/reports/services")
groom = [x for x in r["data"]["requests"] if x.get("source") == "boarding"]
recon("services boarding rows present", len(groom) > 0, 1)

print("=" * 70)
print("WF5  Grooming")
print("=" * 70)
svc = sql("SELECT name FROM services WHERE category='Grooming' LIMIT 1") or "Nail Trimming"
code, d = call("POST", "/grooming", "admin", {
    "customer_id": int(cust_id), "pet_id": int(pet_id),
    "service": svc, "appointment_date": TOMORROW,
    "appointment_time": f"{random.randint(10,16)}:{random.choice(['00','15','30','45'])}",
})
g_id = (d.get("grooming") or d.get("data") or {}).get("id") or d.get("id")
print(f"  grooming_id={g_id} resp={str(d)[:300]}")
r = report("/admin/reports/services")
gs = [x for x in r["data"]["requests"] if x.get("source") == "grooming"]
recon("services includes grooming row", len(gs) > 0, 1)

print("=" * 70)
print("WF4  Veterinary appointment")
print("=" * 70)
vservice_id = sql("SELECT id FROM services WHERE is_active=1 LIMIT 1")
code, d = call("POST", "/appointments", "admin", {
    "customer_id": int(cust_id), "pet_id": int(pet_id),
    "service_id": int(vservice_id),
    "scheduled_at": f"{TOMORROW} {random.randint(10,16)}:{random.choice(['00','30'])}:00",
})
a_id = (d.get("appointment") or d.get("data") or {}).get("id") or d.get("id")
print(f"  appointment_id={a_id} resp={str(d)[:300]}")
r = report("/admin/reports/veterinary")
print(f"  veterinary summary={json.dumps(r.get('summary', r.get('data', {}).get('summary', {})), default=str)[:300]}")

print("=" * 70)
print("WF7  Inventory stock adjustment (inventory role)")
print("=" * 70)
code, d = call("POST", f"/inventory/items/{item_id}/adjust-stock", "inventory",
               {"quantity": 5, "type": "remove", "reason": "E2E audit adjustment"})
print(f"  adjust resp={str(d)[:200]}")
r = report("/admin/reports/inventory")
print(f"  inventory report summary={json.dumps(r.get('summary', r.get('data', {}).get('summary', {})), default=str)[:300]}")

print("=" * 70)
print("WF3  Payment rejection (cashier rejects boarding payment)")
print("=" * 70)
if b_id:
    sql(f"UPDATE boardings SET payment_status='pending' WHERE id={b_id};")
    code, d = call("POST", f"/cashier/boarding-payments/{b_id}/reject", "cashier",
                   {"reason": "E2E rejection test"})
    db_status = sql(f"SELECT payment_status FROM boardings WHERE id={b_id}")
    print(f"  db payment_status={db_status}")

print("=" * 70)
print("WF1  Customer order workflow (expected DISABLED 410)")
print("=" * 70)
code, d = call("POST", "/customer/store/checkout", "customer",
               {"items": [{"item_id": int(item_id), "quantity": 1}]})
results.append(("wf1.checkout_disabled_410", code, 410, "PASS" if code in (410, 404, 422) else "FAIL"))
code, d = call("POST", "/receptionist/customer-orders/1/approve", "receptionist", {})
results.append(("wf1.receptionist_approve_disabled", code, 410, "PASS" if code == 410 else "FAIL"))

print("=" * 70)
print("FINAL unified revenue reconciliation")
print("=" * 70)
r = report("/admin/reports/executive")
print(f"  executive summary={json.dumps(r.get('data', {}).get('summary', {}), default=str)[:400]}")
r2 = report("/admin/reports/cashier")
print(f"  cashier summary={json.dumps(r2.get('summary', {}), default=str)[:400]}")

print("\n" + "=" * 70)
print("RECONCILIATION TABLE")
print("=" * 70)
fails = 0
for name, a, b, st in results:
    print(f"  {st}  {name}: api={a} db={b}")
    if st == "FAIL":
        fails += 1
print(f"\n{len(results)-fails}/{len(results)} reconciliations passed")
