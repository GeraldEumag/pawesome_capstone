The development of the system followed the Agile Incremental Model adapted
from Sommerville (2016) and Pressman (2014), in which the product is built and
released through a sequence of increments rather than a single development
pass. Each increment passes through a complete development cycle — analysis,
design, coding, testing, and implementation — and produces a working version
of the system that serves as the baseline for the next increment. Refinements
and new requirements discovered in one increment are carried forward into the
succeeding cycle, so the system progressively converges toward the final
product. Table X summarizes the activities and outputs of the three increments
undertaken in this study.

Table X
Activities Performed per Increment under the Agile Incremental Model

| Phase          | Increment 1 — Initial Development | Increment 2 — Revisions | Increment 3 — Suggestions and Fixing |
|----------------|-----------------------------------|--------------------------|--------------------------------------|
| Analysis       | Gathered functional and non-functional requirements for an integrated pet-care management system; identified nine user roles (customer, receptionist, cashier, inventory, veterinary, vet tech, manager, admin, super receptionist) and the modules each role operates | Conducted systematic verification of the working system: automated test coverage planned per role, manual workflow walkthroughs, and defect triage of all issues found | Gathered evaluator and adviser feedback and performed a structured defense-readiness audit; defined acceptance criteria through four audit gates (cross-role workflow, security/RBAC, database readiness, report reconciliation) |
| Design         | Designed the system architecture: Laravel REST API backend, React single-page application frontend, MySQL database, token-based authentication, and role-based access control | Designed the test matrix, browser end-to-end scenarios, and audit tooling needed to validate every role's workflow | Designed remediation items: security containment for maintenance scripts, a durable transactional email outbox, the intentional descoping of customer online ordering, and landing-page content management |
| Coding         | Implemented all system modules: customer booking and payments, receptionist scheduling and check-in, cashier POS and payment verification, inventory with batch FIFO tracking, veterinary consultations and medical records, attendance and semi-monthly payroll, notifications, and the landing page | Corrected defects discovered through testing, including attendance-hour computation for payroll, sales-report filtering, authorization gaps, storage handling, and reuse of credentials from deactivated accounts | Implemented the feedback and audit findings: enforced configurable security settings, authorization-gated private files, payslip-release emails, landing-page image management, and realistic full-year employee attendance data for payroll demonstration |
| Testing        | Performed module-level feature testing alongside implementation and manual end-to-end walkthroughs | Executed the full automated suite: backend feature tests, frontend unit tests, browser end-to-end sweeps, and a cross-role workflow audit | Executed the four audit gates against the running system with all checks passing, and re-ran the full regression suite after every change |
| Implementation | Deployed the first working version: frontend on Vercel, backend API and MySQL database on Railway, with seeded demonstration accounts | Redeployed the revised system; maintained test documentation tracking every case and its result | Produced the final deployable state and defense-readiness evidence: production configuration verified, migration pipeline validated, and audit reports archived |
