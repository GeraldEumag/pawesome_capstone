API=http://127.0.0.1:8001/api
TA=$(cat /tmp/token_a.txt); TB=$(cat /tmp/token_b.txt)
probe() {
  local label="$1" m="$2" p="$3" tok="$4" data="$5"
  local code body
  if [ -n "$data" ]; then
    body=$(curl -s -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -H "Accept: application/json" -d "$data")
  else
    body=$(curl -s -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H "Accept: application/json")
  fi
  code=$(echo "$body" | tail -c0 >/dev/null; curl -s -o /dev/null -w "%{http_code}" -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -H "Accept: application/json" ${data:+-d "$data"})
  echo "$code | $label | $m $p"
}
{
echo "=== MASS ASSIGNMENT: profile ==="
probe "A role=admin"      PUT "/auth/profile" "$TA" '{"name":"X","role":"admin","is_active":true,"email_verified_at":"2026-01-01"}'
probe "A pet customer_id" POST "/customer/pets" "$TA" '{"name":"MPet","species":"Dog","customer_id":2,"user_id":10,"role":"admin"}'
probe "A SR spoof fields" POST "/customer/requests" "$TA" '{"customer_name":"X","pet_id":1,"request_type":"veterinary","service_name":"Consultation","request_date":"2026-11-27","request_time":"10:00","customer_id":10,"status":"approved","payment_status":"paid","approved_by":1,"price":0.01,"total_amount":0.01}'
echo "=== PAYMENT MANIPULATION ==="
probe "A proof on pending SR4 (unpaid+pending-status)" POST "/customer/requests/4/payment-proof" "$TA"
probe "A mark paid via PATCH status" PATCH "/customer/requests/4/cancel" "$TA" '{"status":"paid","payment_status":"paid","reason":"x"}'
probe "B proof on A SR4" POST "/customer/requests/4/payment-proof" "$TB"
probe "B cancel B own SR6 (control)" PATCH "/customer/requests/6/cancel" "$TB" '{"reason":"changed mind"}'
echo "=== DESCOPE BOUNDARY (expect 410) ==="
probe "checkout"        POST "/customer/store/checkout" "$TA" '{"items":[{"id":1,"qty":1}]}'
probe "order cancel"    POST "/customer/store/orders/1/cancel" "$TA" '{}'
probe "order proof"     POST "/customer/store/orders/1/payment-proof" "$TA" '{}'
probe "orders read"     GET "/customer/store/orders" "$TA"
probe "order read"      GET "/customer/store/orders/1" "$TA"
probe "order receipt"   GET "/customer/store/orders/1/receipt" "$TA"
echo "=== ROLE-BY-CREATE: register with role field ==="
probe "register role"   POST "/auth/register" "" '{"name":"Evil","first_name":"E","last_name":"V","username":"eviluser","email":"evil@test.com","password":"Password123!","role":"admin","is_active":false}'
} | tee gate2-massassign-descope.txt
