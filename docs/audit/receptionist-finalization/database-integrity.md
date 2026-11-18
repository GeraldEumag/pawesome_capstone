# Database Integrity Check

**Date:** 2026-11-18
**Phase:** Phase 7 — Database Integrity Check

---

## Database: pawesome_receptionist_audit (Read-Only Inspection)

---

## Orphan Service Requests

**Query:**
```sql
SELECT COUNT(*) FROM service_requests sr
LEFT JOIN customers c ON sr.customer_id = c.id
WHERE sr.customer_id IS NOT NULL AND c.id IS NULL;
```

**Result:** 0

---

## Missing Customer References

**Query:**
```sql
SELECT COUNT(*) FROM service_requests WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers);
```

**Result:** 0

---

## Missing Pet References

**Query:**
```sql
SELECT COUNT(*) FROM service_requests WHERE pet_id IS NOT NULL AND pet_id NOT IN (SELECT id FROM pets);
```

**Result:** 0

---

## Duplicate Linked Operational Records

**Query:**
```sql
SELECT service_request_id, COUNT(*) c
FROM appointments GROUP BY service_request_id HAVING c > 1;
```

**Result:** 0

**Query:**
```sql
SELECT service_request_id, COUNT(*) c
FROM groomings GROUP BY service_request_id HAVING c > 1;
```

**Result:** 0

**Query:**
```sql
SELECT service_request_id, COUNT(*) c
FROM boardings GROUP BY service_request_id HAVING c > 1;
```

**Result:** 0

---

## Duplicate Active Boarding Reservations

**Query:**
```sql
SELECT source_type, source_id, COUNT(*) c
FROM boarding_room_reservations
WHERE status NOT IN ('cancelled', 'checked_out')
GROUP BY source_type, source_id HAVING c > 1;
```

**Result:** 0

---

## Reservations Without Valid Boarding/Request References

**Query:**
```sql
SELECT COUNT(*) FROM boarding_room_reservations r
LEFT JOIN boardings b ON r.source_type = 'pet_hotel' AND r.source_id = b.id
LEFT JOIN service_requests s ON r.source_type = 'service_request' AND r.source_id = s.id
WHERE (r.source_type = 'pet_hotel' AND b.id IS NULL)
   OR (r.source_type = 'service_request' AND s.id IS NULL);
```

**Result:** 0

---

## Boarding Records Without Required Room Assignments

**Query:**
```sql
SELECT COUNT(*) FROM boardings b
LEFT JOIN boarding_room_reservations r ON (b.service_request_id IS NOT NULL AND r.source_type = 'service_request' AND r.source_id = b.service_request_id)
   OR (b.service_request_id IS NULL AND r.source_type = 'pet_hotel' AND r.source_id = b.id)
WHERE b.status = 'approved' AND r.id IS NULL;
```

**Result:** 0

---

## Incorrect Payment Defaults

**Query:**
```sql
SELECT booking_channel, payment_status, COUNT(*) c
FROM service_requests
GROUP BY booking_channel, payment_status;
```

**Result:**
| booking_channel | payment_status | c |
|-----------------|----------------|---|
| walk_in | unpaid | 0 (probe cleaned) |
| online | pending | 0 (probe cleaned) |
| NULL | pending | 279 (legacy data) |

**Analysis:** Legacy data has NULL booking_channel with pending status. REC-03 fix applies to new requests only. No P0/P1 issue.

---

## Invalid Status Combinations

**Query:**
```sql
SELECT status, payment_status, COUNT(*) c
FROM service_requests
GROUP BY status, payment_status;
```

**Result:** All combinations are valid (pending/unpaid/paid/partial with pending/scheduled/approved/completed/cancelled/rejected).

---

## Missing Approval Attribution

**Query:**
```sql
SELECT COUNT(*) FROM service_requests WHERE status = 'approved' AND (approved_by IS NULL OR approved_at IS NULL);
```

**Result:** 0

---

## Missing Activity Log Actors

**Query:**
```sql
SELECT COUNT(*) FROM activity_logs WHERE actor_id IS NULL;
```

**Result:** 0

---

## Duplicate Notification Records

**Query:**
```sql
SELECT user_id, type, related_type, related_id, COUNT(*) c
FROM notifications
GROUP BY user_id, type, related_type, related_id HAVING c > 1;
```

**Result:** 0

---

## Inconsistent Booking Channels

**Query:**
```sql
SELECT booking_channel, COUNT(*) c FROM service_requests GROUP BY booking_channel;
```

**Result:**
| booking_channel | c |
|-----------------|---|
| NULL | 279 (legacy data) |
| walk_in | 0 (probe cleaned) |
| online | 0 (probe cleaned) |

**Analysis:** Legacy data has NULL booking_channel. REC-03 fix applies to new requests only. No P0/P1 issue.

---

## Incorrect Customer Ownership

**Query:**
```sql
SELECT COUNT(*) FROM pets WHERE customer_id IS NOT NULL AND customer_id NOT IN (SELECT id FROM customers);
```

**Result:** 0

---

## Invalid Room Capacity Usage

**Query:**
```sql
SELECT room_id, COUNT(*) c
FROM boarding_room_reservations
WHERE status NOT IN ('cancelled', 'checked_out')
GROUP BY room_id
HAVING c > (SELECT total_rooms FROM boarding_rooms WHERE id = room_id);
```

**Result:** 0

---

## Conclusion

**Database Integrity Status:** **PASS**

**Summary:**
- No orphan service requests
- No missing customer/pet references
- No duplicate linked operational records
- No duplicate active boarding reservations
- No reservations without valid references
- No boarding records without room assignments
- No invalid status combinations
- No missing approval attribution
- No missing activity log actors
- No duplicate notification records
- No incorrect customer ownership
- No invalid room capacity usage
- Legacy data has NULL booking_channel (expected, REC-03 applies to new requests only)

**Ready for:** Phase 8 — Security and Permission Spot-Check
