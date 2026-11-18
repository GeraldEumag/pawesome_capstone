# Online / Walk-In Workflow Comparison

| Concern | Online | Receptionist walk-in |
| --- | --- | --- |
| Entry | `customer/requests` (vet/groom), `customer/boardings` (hotel) | `receptionist/walk-ins` |
| Customer/pet | Authenticated customer and owned pet | Existing customer/pet or receptionist-created records |
| Channel | Server stamps `online` | Server stamps `walk_in` |
| Source | `service_requests` plus service-specific row | Same central request and type-specific row |
| Availability | Shared scheduling lock/room reservation checks | Shared service schedule lock/room lock |
| Payment | Customer proof upload → cashier verification | Cashier counter collection allowed under walk-in channel rules |
| Hotel requirements | Vaccination document verification before approval | Card gate exempt for staff-created walk-in |
| Authorization | Customer owns request/pet; staff-only actions forbidden | Receptionist-only creation; cashier/vet actions remain role-gated |

Observed differences are intentional business rules, not parallel booking systems. Walk-in hotel reservations may be created under `pet_hotel` polymorphic source keys while online hotel reservations may use `service_request`; code must preserve both.
