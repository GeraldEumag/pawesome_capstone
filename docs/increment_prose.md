## Increment 1 — Initial Development

The first increment established the complete working system. During analysis,
the proponents gathered the functional and non-functional requirements of an
integrated pet-care management system through observation of clinic workflows
and consultation with stakeholders. The requirements analysis identified nine
distinct user roles — customer, receptionist, cashier, inventory personnel,
veterinarian, veterinary technician, manager, administrator, and a composite
super-receptionist — together with the modules each role must operate: online
booking for veterinary, grooming, and boarding services; point-of-sale
transactions; inventory management with batch tracking; employee attendance
and payroll; and customer account services.

In the design phase, the proponents selected a two-tier architecture: a
Laravel REST API backend, a React single-page application frontend, and a
MySQL relational database. Token-based authentication using Laravel Sanctum
personal access tokens was designed alongside role-based access control
enforced through dedicated middleware, ensuring that each role could only
reach the endpoints appropriate to its function. The database schema was
designed to keep every business transaction — service requests, appointments,
payments, inventory movements, and payroll records — normalized and
traceable to its originating workflow.

The coding phase implemented all modules of the system. Customers can browse
services, book appointments, upload payment proofs, and view their own
records and pets. Receptionists review and approve booking requests, schedule
resources, and check in arrivals. Cashiers operate the point-of-sale register
and verify or reject submitted payment proofs. Inventory personnel manage
items and batches with first-in-first-out stock deduction and conduct monthly
physical audits subject to managerial approval. Veterinarians conduct
consultations, maintain medical records in a draft-to-final workflow, and
issue diagnostic orders, while veterinary technicians perform specimen
collection without access to clinical actions. Managers compute and release
semi-monthly payroll from attendance records, and the administrator retains
access to all staff modules for oversight and reporting. The public landing
page was built with administrator-managed content.

Testing in this increment was performed alongside implementation through
module-level automated feature tests and manual end-to-end walkthroughs of
each workflow.

The increment concluded with the first implementation: the React frontend
deployed to Vercel and the Laravel API together with the MySQL database
deployed to Railway, with seeded demonstration accounts for every role. The
delivered system was functional end-to-end and formed the baseline for
succeeding increments.

## Increment 2 — Revisions

The second increment subjected the working system to systematic verification
and corrected the defects that verification uncovered. Analysis began with a
testing plan organized around each user role, combining automated backend
feature tests, frontend component unit tests, and scripted browser
end-to-end scenarios, supplemented by manual walkthroughs conducted by the
proponents. Every discrepancy between expected and actual behavior was
recorded and triaged.

The design work of this increment produced a testing matrix mapping each
system feature to its verification method and result, together with
browser-automation specifications covering the complete workflows of every
role.

In the coding phase, the proponents resolved the defects uncovered by the
expanded testing. The most significant of these was an attendance-hour
computation defect in which employee check-outs — including those recorded
through the attendance kiosk — persisted zero working hours, causing hours
worked to reach payroll as zero. Additional fixes corrected a date-filtered
sales report that returned empty results, gaps in role authorization checks,
file-storage handling for uploaded proofs and photos, and a defect that
prevented the re-registration of email addresses belonging to deactivated
accounts.

Testing was then executed at scale: the complete backend test suite, the
frontend unit-test suite, the browser end-to-end suite, and a scripted
cross-role audit exercising a booking from customer submission through
receptionist approval, payment verification, consultation, and settlement.
Every discovered defect was re-tested after its fix.

The revised system was redeployed, and a testing documentation set was
maintained recording each test case, its module, and its result — providing
traceability between the revision work and the evidence that it succeeded.

## Increment 3 — Suggestions and Fixing

The third increment incorporated evaluator and adviser suggestions and
completed the final hardening of the system. Analysis collected feedback from
the review panel and advisers, and a structured defense-readiness audit was
performed across the finished system. Acceptance criteria were formalized as
four audit gates: a cross-role end-to-end workflow gate, a security and
role-based-access gate, a database readiness gate, and a report
reconciliation gate comparing displayed figures against the database.

The design phase settled the remediation approach for the audit findings.
Maintenance and audit scripts were relocated outside the web server's
document root to eliminate HTTP-reachable utilities. A durable transactional
email outbox was designed so that every customer-facing email is recorded,
deduplicated, and sent by a worker rather than assumed delivered. A scope
decision retired the customer online-ordering workflow while preserving
historical records, receipts, and reporting. The landing page was extended
into administrator-managed content, including configurable imagery.

The coding phase implemented these decisions: configurable security
settings — password policy, login throttling, and idle-session timeout — were
enforced rather than decorative; private files such as payment proofs and
profile photos were placed behind authorization checks; payslip-release
notifications were routed through the email outbox; the landing page gained
image management together with a loading correction that prevents replaced
images from flashing on load; and a full-year 2027 employee attendance seeder
was created containing realistic imperfections — absences, leaves, late
arrivals, early departures, overtime, and missed check-outs — so that payroll
computation can be demonstrated against imperfect, lifelike data.

Testing in this increment executed all four audit gates against the running
system. The cross-role workflow gate passed all thirty-two checks; the
security and role-access gate produced no authorization violations; the
database readiness gate passed all one hundred twenty-one checks; and the
report reconciliation gate confirmed that every dashboard and report figure
agrees with the underlying database. The full regression suite was re-run
after every change.

Implementation delivered the final deployable state: production configuration
was verified, the migration pipeline was validated against a fresh database,
scheduled tasks and caching were confirmed, and the audit evidence was
archived. The system emerging from this increment constitutes the complete
software product described in this study.
