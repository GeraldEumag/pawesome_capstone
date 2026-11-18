API=http://127.0.0.1:8001/api
TA=$(cat /tmp/token_a.txt); TB=$(cat /tmp/token_b.txt)
probe() { # label method path token [data]
  local label="$1" m="$2" p="$3" tok="$4" data="$5"
  local code
  if [ -n "$data" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" -H "Accept: application/json" -d "$data")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H "Accept: application/json")
  fi
  echo "$code | $label | $m $p"
}
{
echo "=== CONTROL: A on own resources ==="
probe "A own pet 1"        GET "/customer/pets/1" "$TA"
probe "A own SR 4"        GET "/customer/my-requests" "$TA"
probe "A own boarding 2"  GET "/customer/boardings/2" "$TA"
probe "A own boarding 1"  GET "/customer/boardings/1" "$TA"
probe "A own grooming 4"  GET "/customer/grooming/4" "$TA"
probe "A own pet photo"   GET "/files/pet-photos/1/view" "$TA"
echo "=== IDOR: B token on A resources ==="
probe "B read A pet 1"         GET "/customer/pets/1" "$TB"
probe "B read A pet (shared)"  GET "/pets/1" "$TB"
probe "B update A pet 1"       PUT "/customer/pets/1" "$TB" '{"name":"PWNED"}'
probe "B delete A pet 1"       DELETE "/customer/pets/1" "$TB"
probe "B archive A pet 1"      POST "/customer/pets/1/archive" "$TB"
probe "B unarchive A pet 1"    POST "/customer/pets/1/unarchive" "$TB"
probe "B medhistory A pet"     GET "/customer/pets/1/medical-history" "$TB"
probe "B cancel A SR 4"        PATCH "/customer/requests/4/cancel" "$TB" '{"reason":"idor"}'
probe "B receipt A SR 4"       GET "/customer/requests/4/receipt" "$TB"
probe "B read A boarding 2"    GET "/customer/boardings/2" "$TB"
probe "B read A boardingreq 2" GET "/customer/boarding-requests/2" "$TB"
probe "B read A boarding 1"    GET "/customer/boardings/1" "$TB"
probe "B cancel A boarding 2"  POST "/customer/boardings/2/cancel" "$TB" '{"reason":"idor"}'
probe "B cancel A boardingreq" POST "/customer/boarding-requests/2/cancel" "$TB" '{"reason":"idor"}'
probe "B carelogs A boarding"  GET "/customer/boarding-requests/2/care-logs" "$TB"
probe "B read A grooming 4"    GET "/customer/grooming/4" "$TB"
probe "B A confinements list"  GET "/customer/medical-confinements/1" "$TB"
probe "B conf carelogs"        GET "/customer/medical-confinements/1/care-logs" "$TB"
probe "B conf notes"           GET "/customer/medical-confinements/1/medical-notes" "$TB"
probe "B conf proof"           POST "/customer/medical-confinements/1/payment-proof" "$TB"
probe "B pet photo A"          GET "/files/pet-photos/1/view" "$TB"
probe "B vacc card A bd2"      GET "/files/vaccination-cards/2/view" "$TB"
probe "B billing A"            GET "/customer/billing" "$TB"
probe "B receipt-status A"     GET "/customer/receipts/service_request/4" "$TB"
probe "B submit ref on A"      POST "/customer/receipts/1/reference" "$TB" '{"payment_reference":"IDOR123"}'
echo "=== IDOR: A token on B resources (pet 6, SR 6) ==="
probe "A read B pet 6"         GET "/customer/pets/6" "$TA"
probe "A cancel B SR 6"        PATCH "/customer/requests/6/cancel" "$TA" '{"reason":"idor"}'
probe "A update B pet 6"       PUT "/customer/pets/6" "$TA" '{"name":"PWNED2"}'
echo "=== Verified email gate: B unverified? (B is verified now; use fresh unverified later) ==="
echo "=== Notification IDOR ==="
probe "B read A notif 39"      POST "/notifications/39/read" "$TB"
probe "B del A notif 39"       DELETE "/notifications/39" "$TB"
echo "=== Role boundary: customer on staff prefixes ==="
for p in admin/dashboard receptionist/dashboard cashier/dashboard inventory/dashboard veterinary/dashboard manager/dashboard admin/users receptionist/requests cashier/payment-requests; do
  probe "cust->/api/$p" GET "/$p" "$TA"
done
echo "=== Unauthenticated ==="
probe "unauth pets" GET "/customer/pets" "BADTOKEN"
probe "unauth SR"   GET "/customer/my-requests" "BADTOKEN"
} | tee gate2-idor-matrix.txt
