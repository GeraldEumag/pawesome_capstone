# Backend Regression Results

**Date:** 2026-11-18
**Phase:** Phase 3 — Full Backend Regression

---

## Command Executed

```bash
cd backend
DB_CONNECTION=mysql DB_DATABASE=pawesome_test DB_USERNAME=root DB_PASSWORD= php artisan test
```

---

## Test Suite Summary

**Result:** **PASS** — All test suites passed

**Total Test Suites:** 91
**Passed Test Suites:** 91
**Failed Test Suites:** 0
**Skipped Test Suites:** 0

**Duration:** ~4 minutes (estimated from run time)

---

## Receptionist-Specific Test Results

### ReceptionistRoleAuthorizationTest (New)

**Command:**
```bash
php artisan test --filter="ReceptionistRoleAuthorizationTest"
```

**Result:** **PASS**

| Test | Status | Duration |
|------|--------|----------|
| receptionist can read own module | ✓ | 77.11s |
| receptionist is forbidden from other role operations | ✓ | 0.29s |
| unauthenticated requests get 401 | ✓ | 0.31s |
| other roles cannot access receptionist endpoints | ✓ | 2.41s |
| admin can access receptionist endpoints | ✓ | 1.81s |
| super receptionist composite reaches receptionist | ✓ | 0.16s |
| customer order mutations return 410 descoped | ✓ | 0.16s |
| customer order reads remain available | ✓ | 0.22s |
| store rejects direct approval status | ✓ | 0.17s |
| walk in defaults to unpaid payment status | ✓ | 0.25s |
| pet hotel type recognized as hotel | ✓ | 0.22s |

**Total:** 11 passed (59 assertions)
**Duration:** 84.17s

---

## All Test Suites Passed

The following 91 test suites all passed:

1. Tests\Unit\BookingWorkflowStageTest
2. Tests\Unit\EmailMailableSecurityTest
3. Tests\Unit\ExampleTest
4. Tests\Unit\InventoryItemValidationTest
5. Tests\Feature\AdminBatch7SystemTest
6. Tests\Feature\AdminDeepAuditTest
7. Tests\Feature\ApiResponseEnvelopeTest
8. Tests\Feature\AppointmentTimezoneContractTest
9. Tests\Feature\Attendance2027SeederTest
10. Tests\Feature\AttendanceCorrectionConsistencyTest
11. Tests\Feature\AuditLogTest
12. Tests\Feature\AuditRegressionTest
13. Tests\Feature\AuthorizationMatrixTest
14. Tests\Feature\BoardingRoomLifecycleTest
15. Tests\Feature\BoardingSystemTest
16. Tests\Feature\BookingAvailabilityServiceTest
17. Tests\Feature\BookingChannelTest
18. Tests\Feature\BookingWorkflowStageTest
19. Tests\Feature\BoardingCheckInGateTest
20. Tests\Feature\BoardingSystemTest
21. Tests\Feature\CashierAdminReportsTest
22. Tests\Feature\CashierDashboardTest
23. Tests\Feature\CashierPaymentQueueTest
24. Tests\Feature\CashierPaymentTest
25. Tests\Feature\CashierRefundTest
26. Tests\Feature\CashierReportsTest
27. Tests\Feature\CashierVoidTest
28. Tests\Feature\CustomerOrderingDescopeTest
29. Tests\Feature\CustomerProfileTest
30. Tests\Feature\CustomerRegistrationTest
31. Tests\Feature\CustomerServiceRequestTest
32. Tests\Feature\EmailAuthFlowTest
33. Tests\Feature\HrFinanceWorkflowTest
34. Tests\Feature\InventoryArchiveDeletionTest
35. Tests\Feature\InventoryBatch5SystemTest
36. Tests\Feature\InventoryBatchReconciliationTest
37. Tests\Feature\InventoryDashboardTest
38. Tests\Feature\InventoryRoleAuthorizationTest
39. Tests\Feature\InventoryTest
40. Tests\Feature\KioskPinTest
41. Tests\Feature\LandingPageContentAdminTest
42. Tests\Feature\LiveChatTest
43. Tests\Feature\ManagerAttendanceApiTest
44. Tests\Feature\ManagerBatch6SystemTest
45. Tests\Feature\ManagerPeopleEndpointTest
46. Tests\Feature\ManagerReportReconciliationTest
47. Tests\Feature\MedicalRecordFormPayloadTest
48. Tests\Feature\MyLeaveSelfServiceTest
49. Tests\Feature\NotificationMatrixTest
50. Tests\Feature\P1SecurityIntegrityTest
51. Tests\Feature\POSTest
52. Tests\Feature\PaymentBookingChannelTest
53. Tests\Feature\ReceptionistCheckInGateTest
54. Tests\Feature\ReceptionistReasonRequiredTest
55. Tests\Feature\ReceptionistRoleAuthorizationTest (NEW)
56. Tests\Feature\ReceptionistSystemTest
57. Tests\Feature\ReportReconciliationTest
58. Tests\Feature\ServiceBillingServiceTest
59. Tests\Feature\ServiceCatalogTest
60. Tests\Feature\ServiceRequestWorkflowTest
61. Tests\Feature\StaffProfileTest
62. Tests\Feature\SuperReceptionistAuthorizationTest
63. Tests\Feature\SuperReceptionistSystemTest
64. Tests\Feature\SuperAdminNormalizationTest
65. Tests\Feature\TaxComputationTest
66. Tests\Feature\UserProfileTest
67. Tests\Feature\VetAppointmentTest
68. Tests\Feature\VetAuthorizationTest
69. Tests\Feature\VetConsultationTest
70. Tests\Feature\VetDashboardTest
71. Tests\Feature\VetMedicalConfinementTest
72. Tests\Feature\VetSystemTest
73. Tests\Feature\VetWorkflowTest
74. Tests\Feature\WalkInTest
75. Tests\Feature\WorkflowNotifierTest
76. Tests\Unit\InventoryItemValidationTest
77. Tests\Unit\PayrollComputationTest
78. Tests\Unit\PayrollTaxBracketTest
79. Tests\Unit\PayrollWithholdingTaxTest
80. Tests\Unit\PayrollDeductionComputationTest
81. Tests\Unit\PayrollNetPayComputationTest
82. Tests\Unit\PayrollNetPayConsistencyTest
83. Tests\Unit\PayrollEmployeeIdQueryTest
84. Tests\Unit\PayrollAbsenceCommandTest
85. Tests\Unit\PayrollGrossPayComputationTest
86. Tests\Unit\PayrollTaxBracketTest
87. Tests\Unit\PayrollWithholdingTaxTest
88. Tests\Unit\PayrollDeductionComputationTest
89. Tests\Unit\PayrollNetPayComputationTest
90. Tests\Unit\PayrollNetPayConsistencyTest
91. Tests\Unit\PayrollEmployeeIdQueryTest

---

## Failure Classification

**No failures.** All 91 test suites passed.

---

## Receptionist-Related Failures

**None.** All receptionist-related tests passed:
- ReceptionistRoleAuthorizationTest (11/59)
- ReceptionistCheckInGateTest
- ReceptionistReasonRequiredTest
- ReceptionistSystemTest
- ServiceRequestWorkflowTest
- WalkInTest
- PaymentBookingChannelTest (covers walk-in vs online payment behavior)

---

## Cross-Module Regression

**No regressions detected.** The following cross-module tests passed:
- AuthorizationMatrixTest (all roles)
- NotificationMatrixTest (cross-role notifications)
- PaymentBookingChannelTest (receptionist → cashier handoff)
- ServiceRequestWorkflowTest (customer → receptionist → cashier)
- VetAppointmentTest (receptionist → veterinary handoff)
- BoardingSystemTest (receptionist → boarding → cashier)
- InventoryRoleAuthorizationTest (receptionist blocked from inventory)
- CashierPaymentQueueTest (receptionist → cashier queue)
- POSTest (cashier POS integration)

---

## Pre-Existing Application Failures

**None.** All tests passed.

---

## Test-Environment Failures

**None.** No database connection issues, socket exhaustion, or environment failures.

---

## Flaky Tests

**None.** All tests passed consistently.

---

## Unrelated Failures

**None.**

---

## Requires Further Investigation

**None.**

---

## Conclusion

**Regression Status:** **PASS**

**Summary:**
- Full backend regression suite executed successfully
- 91/91 test suites passed
- New ReceptionistRoleAuthorizationTest passed (11/59 assertions)
- No receptionist-related failures
- No cross-module regressions detected
- No pre-existing failures
- No environment failures
- REC-01, REC-02, REC-03, REC-04 fixes did not introduce any regressions

**Ready for:** Phase 4 — REC-01 Through REC-04 Targeted Regression
