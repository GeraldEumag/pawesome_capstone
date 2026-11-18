# Booking Payment Integration Audit

- Customer payment-proof upload is not verification: multipart proof upload returned pending; cashier verification changed payment to paid and issued a receipt number.
- Duplicate verification returned 422 (`Only pending payment proofs can be verified`).
- Online bookings cannot use counter cash unless a proof was rejected; walk-in hotel counter cash succeeded. `PaymentBookingChannelTest` covers these channel rules and proof rejection/resubmission.
- Boarding and grooming completion/check-in gates verify payment; booking status and payment status remain distinct.
- Server-calculated totals were used; client price spoof on veterinary creation did not persist (`0.01` supplied, catalog price `500.00` stored).
- Live mailer was `array`; no third-party payment or email provider was called. Provider settlement, refunds, and receipt delivery are not certified by this audit.
