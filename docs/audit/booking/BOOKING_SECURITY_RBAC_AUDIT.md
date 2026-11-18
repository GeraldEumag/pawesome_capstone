# Booking Security / RBAC Audit

Direct probes against the isolated API returned 401 for unauthenticated booking writes and 403 for customer→receptionist approval, vet→approval, receptionist→cashier verification, cashier→vet status update, and customer→walk-in creation. Customer pet ownership checks, request IDs, service IDs and room IDs are validated server-side. Price spoofing is ignored in favor of catalog pricing.

Routes are protected by `auth.api`, role middleware and verified-customer middleware where required; UI visibility is not relied on as authorization. Existing `AuthorizationMatrixTest` and `P1SecurityIntegrityTest` complement the direct probes.

Private uploaded payment/vaccination documents were exercised via authenticated API paths; a complete role-by-role private-file URL traversal and production storage ACL audit were not independently executed. `APP_DEBUG=true` on the local audit stack can expose local stack traces and must be disabled in production.
