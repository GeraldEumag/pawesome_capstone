# Customer Role — API Mapping (Gate 1)

**Audit date:** 2026-11-18 · **Source:** `php artisan route:list -v` (evidence: `browser-evidence/customer-audit/gate1-all-routes.txt`) + frontend `apiRequest` call trace.

Middleware shorthand: **A**=`auth.api` (ApiTokenAuth), **T**=`throttle:api`, **C**=`role:customer`, **V**=`verified` (EnsureEmailIsVerified — customers only), **S**=controller self-scopes ownership/role.

## 1. Authentication & account

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| Register | POST | `/api/auth/register` | T | `AuthController@register` | users, customers, email_verification_tokens, email_deliveries |
| Login | POST | `/api/auth/login` | T(throttle:auth) | `AuthController@login` | users, personal_access_tokens, notifications |
| Logout | POST | `/api/auth/logout` | A | `AuthController@logout` | personal_access_tokens |
| Current user | GET | `/api/auth/me` | A | `AuthController@me` | users |
| Update profile | PUT | `/api/auth/profile` | A | `AuthController@updateProfile` | users, customers (sync), email_verification_tokens* |
| Change password | POST | `/api/auth/change-password` | A | `AuthController@changePassword` | users, email_deliveries |
| Upload photo | POST | `/api/auth/profile-photo` | A | `AuthController@uploadProfilePhoto` | users, storage |
| Verify email | POST | `/api/auth/email/verify` | T | `AuthController@verifyEmail` | email_verification_tokens, users |
| Resend verify | POST | `/api/auth/email/resend` | T | `AuthController@resendVerificationEmail` | email_verification_tokens, email_deliveries |
| Forgot password | POST | `/api/auth/password/forgot` | T | `AuthController@forgotPassword` | password_reset_tokens, email_deliveries |
| Reset password | POST | `/api/auth/password/reset` | T | `AuthController@resetPassword` | password_reset_tokens, users |

\* email change re-triggers verification for customers.

## 2. Dashboard, services & tracking (`api/customer/*` — all A+T+C)

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| Dashboard | GET | `/api/customer/overview` (+`/dashboard`) | A,T,C | `Customer\PortalController@overview` | customers, pets, appointments, service_requests, customer_orders, sales |
| Services catalog | GET | `/api/customer/services` | A,T,C | `PortalController@services` | services |
| My appointments | GET | `/api/customer/appointments` | A,T,C | `PortalController@appointments` | appointments |
| Booking board | GET | `/api/customer/bookings` | A,T,C | `Customer\BookingBoardController@index` | service_requests, appointments, groomings, boardings |
| Tracking | GET | `/api/customer/tracking` | A,T,C | `PortalController@tracking` | appointments, groomings, boardings, service_requests |
| Transactions | GET | `/api/customer/transactions` (+`orders/history`, `payments/history`, `reports/{payments,receipts}`) | A,T,C | `PortalController@transactions` | sales, service_requests, boardings, customer_orders, payments |
| Purchases | GET | `/api/customer/purchases` | A,T,C | `PortalController@purchases` | sales, sale_items |
| Legacy appt booking | POST | `/api/customer/appointments` | A,T,C,**V** | `PortalController@bookAppointment` | appointments, service_requests |
| Notification prefs | GET/PUT | `/api/customer/notification-preferences` | A,T,C | `PortalController@{notificationPreferences,updateNotificationPreferences}` | customers.notification_preferences |
| Customer chatbot | POST | `/api/customer/chatbot` | A,T,C | `PortalController@chatbot` | chatbot_logs |

## 3. Service requests — vet & grooming (`ServiceRequestController`)

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| Submit request | POST | `/api/customer/requests` | A,T,C,**V** | `ServiceRequestController@store` | service_requests, groomings(auto), pets, services, notifications |
| My requests | GET | `/api/customer/my-requests` (+`requests/history`, `reports/services`) | A,T,C | `ServiceRequestController@customerRequests` | service_requests (customer_id=users.id) |
| Cancel request | PATCH | `/api/customer/requests/{id}/cancel` | A,T,C | `ServiceRequestController@cancel` | service_requests, appointments, groomings, boardings (propagates), cancellation_reason |
| Upload proof | POST | `/api/customer/requests/{id}/payment-proof` | A,T,C | `ServiceRequestController@uploadPaymentProof` | service_requests(+linked grooming/boarding/appointment), payment_receipts, receipt_validations, storage |
| Receipt | GET | `/api/customer/requests/{id}/receipt` | A,T,C | `ServiceRequestController@receipt` | service_requests, sales, payments |

## 4. Grooming (`api/customer/grooming`)

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| List own | GET | `/api/customer/grooming` | A,T,C | `Api\GroomingController@index` | groomings |
| Create | POST | `/api/customer/grooming` | A,T,C,**V** | `Api\GroomingController@store` | groomings, service_requests, services |
| View one | GET | `/api/customer/grooming/{id}` | A,T,C | `Api\GroomingController@show` | groomings |

## 5. Boarding / hotel (`BoardingController`, customer-scoped)

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| List own | GET | `/api/customer/boardings` (+`boarding-requests`, `reports/boarding`) | A,T,C | `BoardingController@index` | boardings (customer_id=customers.id) |
| Create | POST | `/api/customer/boardings` (+`boarding-requests`) | A,T,C,**V** | `BoardingController@store` | boardings, service_requests, pets, boarding_rooms/reservations, storage (vacc card) |
| View one | GET | `/api/customer/boardings/{id}` (+`boarding-requests/{id}`) | A,T,C | `BoardingController@show` | boardings |
| Cancel | POST | `/api/customer/boardings/{id}/cancel` (+`boarding-requests/{id}/cancel`) | A,T,C | `BoardingController@cancel` | boardings, boarding_room_reservations (released) |
| Upload vacc card | POST | `/api/customer/boarding-requests/{id}/vaccination-card` | A,T,C | `BoardingController@uploadVaccinationCard` | boardings, storage |
| Upload proof | POST | `/api/customer/boarding-requests/{id}/payment-proof` | A,T,C | `BoardingController@uploadPaymentProof` | boardings(+parent SR), payment_receipts |
| Care logs | GET | `/api/customer/boarding-requests/{id}/care-logs` | A,T,C | `BoardingController@careLogs` | boarding_care_logs |
| Available rooms | GET | `/api/customer/boardings/available-rooms` | A,T,C | `BoardingController@availableRooms` | boarding_rooms, boarding_room_reservations |

## 6. Medical confinements (read + proof only)

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| List own | GET | `/api/customer/medical-confinements` (+`reports/confinements`) | A,T,C | `MedicalConfinementController@index` | medical_confinements |
| View one | GET | `/api/customer/medical-confinements/{id}` | A,T,C | `MedicalConfinementController@show` | medical_confinements |
| Care logs | GET | `…/{id}/care-logs` | A,T,C | `…@careLogs` | confinement_care_logs |
| Progress notes | GET | `…/{id}/medical-notes` | A,T,C | `…@progressNotes` | confinement_progress_notes |
| Upload proof | POST | `…/{id}/payment-proof` | A,T,C | `…@uploadPaymentProof` | medical_confinements, payment_receipts |

## 7. Veterinary billing

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| Billing list | GET | `/api/customer/billing` | A,T,C | `Customer\VeterinaryBillingController@index` | visit_invoices, appointments |
| Invoice receipt | GET | `/api/customer/billing/payment-requests/{id}/receipt` | A,T,C | `…@receipt` | visit_invoices, payments |
| Request cashier payment | POST | `/api/customer/billing/veterinary/{id}/cashier-payment` | A,T,C,**V** | `…@requestCashierPayment` | visit_invoices, payment_requests |
| Submit online payment | POST | `/api/customer/billing/veterinary/{id}/online-payment` | A,T,C,**V** | `…@submitOnlinePayment` | visit_invoices, payment_receipts, receipt_validations |

## 8. Pets (`api/customer/pets` + shared `api/pets` — S)

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| List own | GET | `/api/customer/pets` (also `/api/pets`) | A,T,C | `PetController@index` | pets (customer_id=customers.id) |
| Create | POST | `/api/customer/pets` | A,T,C | `PetController@store` | pets, customers(firstOrCreate), storage (photo) |
| Archived list | GET | `/api/customer/pets/archived` | A,T,C | `PetController@archived` | pets |
| View/Update/Delete | GET/PUT/DEL | `/api/customer/pets/{id}` | A,T,C | `PetController@{show,update,destroy}` | pets — 404 on foreign pet |
| Archive/Unarchive | POST | `/api/customer/pets/{id}/{archive,unarchive}` | A,T,C | `PetController@{archive,unarchive}` | pets |
| Medical history | GET | `/api/customer/pets/{pet}/medical-history` | A,T,C | `Veterinary\MedicalRecordController@indexByCustomer` | medical_records, vaccinations |
| Vacc certificate | GET | `/api/customer/vaccinations/{id}/certificate` | A,T,C | `…@customerVaccinationCertificate` | vaccinations |

## 9. Payments support — receipt scanner + store reads

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| Receipt scan status | GET | `/api/customer/receipts/{type}/{id}` | A,T,C | `Customer\ReceiptController@status` | payment_receipts, receipt_validations (dual customer_id domain) |
| Manual reference | POST | `/api/customer/receipts/{id}/reference` | A,T,C | `Customer\ReceiptController@submitReference` | payment_receipts, payment_references |
| **Checkout** | POST | `/api/customer/store/checkout` | A,T,C,V | `CustomerStoreController@checkout` | **410 Gone — descoped F-02** |
| Legacy orders | GET | `/api/customer/store/orders` (+`{id}`, `{id}/receipt`) | A,T,C | `CustomerStoreController@{orders,show,receipt}` | customer_orders, customer_order_items (read-only) |
| **Order cancel/proof** | POST | `/api/customer/store/orders/{id}/{cancel,payment-proof}` | A,T,C | `…@{cancel,uploadPaymentProof}` | **410 Gone — descoped F-02** |

## 10. Notifications (self-scoped, any auth'd user)

| Customer action | Method | Endpoint | MW | Controller@action | Tables |
| --- | --- | --- | --- | --- | --- |
| List / unread / count | GET | `/api/notifications{,/unread,/unread-count}` | A,T | `NotificationController@{index,getUnread,unreadCount}` | notifications (user_id or role-scoped) |
| Mark read / all / clear / delete | POST/DELETE | `/api/notifications/{id}/read`, `/mark-all-read`, `/clear-all`, `/{id}` | A,T | `…@{markAsRead,markAllAsRead,clearAll,destroy}` | notifications — own rows only |

## 11. Secure files (owner or staff)

| Customer action | Method | Endpoint | MW | Controller@action |
| --- | --- | --- | --- | --- |
| View payment proof | GET | `/api/files/payment-proofs/{type}/{id}/view` | A,T | `SecureFileController@viewPaymentProof` |
| View receipt file | GET | `/api/files/payment-receipts/{id}/view` | A,T | `…@viewPaymentReceipt` |
| View vacc card | GET | `/api/files/vaccination-cards/{id}/view` | A,T | `…@viewVaccinationCard` |
| View pet photo | GET | `/api/files/pet-photos/{petId}/view` | A,T | `…@viewPetImage` |
| View care-log photo | GET | `/api/files/care-logs/{id}/view` | A,T | `…@viewCareLogPhoto` |
| View profile photo | GET | `/api/files/profile-photos/{userId}/view` | A,T | `…@viewProfilePhoto` (owner or staff) |

## 12. Chatbot & live chat

| Customer action | Method | Endpoint | MW | Controller@action |
| --- | --- | --- | --- | --- |
| Chatbot welcome/message | GET/POST | `/api/chatbot/welcome`, `/api/chatbot/message` | A,T(+chatbot throttle) | `SharedChatbotController` |
| Booking via chatbot | POST | `/api/chatbot/workflow/bookings`, `/hotel-bookings` | A,T(+V, C on hotel) | `ChatbotWorkflowController` |
| Booking options/lookup | GET/POST | `/api/chatbot/workflow/{booking-options,hotel-options,hotel/availability,appointments/lookup,inventory/search}` | A,T | `ChatbotWorkflowController` |
| Live-chat session | GET/POST/DELETE | `/api/chatbot/live-chat/{session,start,{session}}`, `{session}/message` | A,T,C | `LiveChatController` |
| Live-chat poll (shared) | GET | `/api/chatbot/live-chat/{session}/messages` | A,T | `LiveChatController@getMessages` (ownership in controller) |

## 13. Public reads used by customer UI (no auth)

| Action | Method | Endpoint | MW | Controller |
| --- | --- | --- | --- | --- |
| Availability | GET | `/api/availability/{boarding,grooming,veterinary}` | T | `Api\AvailabilityController` |
| Rooms catalog | GET | `/api/public/boarding-rooms`, `/api/boarding/rooms{,/available,/calculate-total,/types,/{id}}`, `/api/boarding/add-ons` | T | `BoardingRoomController`, `BoardingController` |
| Holidays | GET | `/api/holidays/blocked` | T | `Manager\HolidayController@blocked` |
| Services | GET | `/api/services` | A,T | `ServiceCatalogController@publicIndex` |
| Customer-scoped availability | GET/POST | `/api/customer/availability/*` | A,T,C | `Api\AvailabilityController` |

## 14. Frontend call surface vs routes (reconciliation)

All `apiRequest()` calls in `components/customers/*` + shared booking components resolve to routed endpoints above. Findings:

- `CustomerReports.jsx` calls `/admin/reports/customers` **only** when mounted at `/admin/reports/customers` (shared admin view) — not a defect.
- No customer component calls an unrouted endpoint; no store/cart/checkout calls exist.
