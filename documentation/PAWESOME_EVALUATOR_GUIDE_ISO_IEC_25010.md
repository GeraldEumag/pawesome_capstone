# Pawesome Pet Care Management System
## Evaluator Guide for the ISO/IEC 25010:2023 Evaluation Instrument

This guide helps evaluators assess Pawesome against their approved ISO/IEC 25010:2023 evaluation instrument. The evaluation uses the live deployment: Vercel hosts the frontend and Railway hosts the Laravel API and associated services. Confirm the exact live frontend URL, paired API release, and evaluator accounts with the project team before the session. This guide focuses on software quality, not step-by-step system operation. For operating the application, see the separate [Pawesome System User Guide for IT Professional Evaluators](PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.md).


## 1. Purpose

Use this guide to connect each quality indicator in the approved ISO/IEC 25010:2023 instrument to features evaluators can observe in Pawesome. It provides suggested walkthroughs, evidence prompts, and limits on what can reasonably be judged from a demonstration.

Evaluate what you personally observe in the live Vercel/Railway deployment using the account supplied for your evaluation. Do not assume that a feature works because it appears in a menu, is described by staff, or is covered by a test report. Do not give a high score simply because a feature exists.

## 2. System overview

Pawesome is a web-based pet care management system. The main work spans customer pet and service management, front-desk booking operations, payment and point-of-sale tasks, veterinary workflows, inventory, staff management, and reports.

| Account / role | Relevant areas to explore |
|---|---|
| Customer | Pet profiles; grooming, veterinary, and boarding/hotel service requests; booking status; payments and receipts; history; notifications; profile |
| Receptionist | Customer records; hotel/boarding, veterinary, and grooming bookings; walk-ins; service management; history and reports |
| Cashier | Point of sale; payment approvals; sales and transactions; receipts; cashier reports |
| Inventory | Products and stock; batches and stock history; low-stock/expiry views; suppliers; inventory reports and audit |
| Veterinary | Appointments and consultations; medical records; billing; current boarders/confinements; veterinary reports |
| Manager | Staff records; attendance and leave; payroll; operational reports and history |
| Admin | User and role management; system-wide reports; activity/login history; settings |
| Super receptionist | Combined front-desk, cashier, and inventory workflows; it is a composite staff role, not a customer account |

Access is role-based. Admin has broad staff access but is not a customer account; the super receptionist combines receptionist, cashier, and inventory access. Do not expect every menu or action to be available under every account.

## 3. Before the evaluation

The project team should provide the live Vercel frontend URL, confirm the paired Railway API deployment, and provide working evaluator accounts for the roles needed in the session. Obtain credentials directly from the project team; do not copy passwords into this guide or distribute them in the completed evaluation.

Before beginning:

1. Confirm the live Vercel URL, the paired Railway API release, browser, evaluation period, and account roles with the facilitator.
2. Use only evaluator accounts and prepared fictional records. Avoid real customer, employee, pet, payment, or medical information.
3. Treat every write on the live deployment as persistent. Booking, approval, payment, inventory, account, and medical-record changes can affect staff, customers, notifications, reports, and other users.
4. Perform state-changing tasks only when the project team has confirmed isolated evaluator records, explicitly approved the action, and established a safe cleanup plan. Do not reset or delete live data yourself.
5. Record the roles and features you actually tried. Do not use real payment details or send test messages to uncontrolled recipients. A feature not demonstrated is not evidence of either success or failure.

### Rating scale

Use the scale printed on the evaluation instrument:

| Score | Instrument label | Practical interpretation |
|---|---|---|
| 5 | Excellent | Consistently meets the indicator very well during the tasks observed; no meaningful obstacle was noticed. |
| 4 | Very Good | Works well overall; only minor issues or friction were noticed. |
| 3 | Good | Adequate for the observed task, with noticeable limitations or inconsistencies. |
| 2 | Fair | Significant difficulty, defect, or limitation interfered with the observed task. |
| 1 | Poor | The observed function was unusable, incorrect, or seriously deficient for the task. |

These anchors explain the scale; they do not add new scoring rules. Base each answer on evidence from your own session. Use the instrument's remarks field to identify the task and the reason for a low or high rating.

Some indicators (for example, scalability, resistance to attack, and replaceability) cannot be established by an ordinary user walkthrough. If the approved research protocol permits, mark these **not observed / not applicable** and explain why in the remarks rather than guessing or treating missing evidence as a score of 3. The supplied form has no N/A column, so agree with the research supervisor how such items should be recorded before collecting responses. Do not silently change the instrument or its calculations.

## 4. Suggested walkthrough

The facilitator can select one or more flows appropriate to the evaluator's background. This is a menu of safe observation scenarios, not a requirement to perform every mutation.

### A. Customer service journey

With a prepared customer test account:

1. Find the pet area and review or add a test pet, if authorized.
2. Open a grooming, veterinary, or boarding/hotel request form.
3. Review the available choices, required fields, price/details, and booking-review step before submission.
4. Submit only if the project team confirms that the evaluator account and request are isolated from real operations and notifications. Otherwise, stop at the review step or ask the facilitator to demonstrate the saved-request state.
5. Review where payment status, receipt information, and notifications appear. Do not submit a real payment or upload real proof.

Observe whether the task is understandable, the pet and booking details remain clear, validation helps prevent mistakes, and the result is easy to find.

### B. Staff booking-to-service journey

Using prepared data on the live deployment, and only with explicit project-team approval for each state change:

1. Receptionist reviews a pending request and its pet/customer details; inspect the available approve/reject or assignment controls without changing state unless authorized.
2. Cashier opens the POS or payment approvals and reviews how a payment, amount, and receipt are presented. Do not complete a sale or change payment status unless an isolated, non-real-money evaluator flow has been confirmed.
3. Veterinary staff opens an assigned appointment or test consultation and reviews the record, billing, and completion workflow.
4. Inventory staff reviews the item/stock history associated with a test item or service.
5. Manager reviews the corresponding operational report, where available.

This flow can help assess whether role handoffs and shared records are coherent. It does not, by itself, prove interoperability with an external system.

### C. Inventory and reporting

With a read-only or prepared inventory dataset:

1. Find a product and inspect its stock, batch/history, and any low-stock or expiry information.
2. Open an inventory report or audit view and try a relevant filter or date range.
3. Inspect an available export or print action only if it will not expose real data.
4. Compare totals with the prepared test record if the facilitator provides an expected result.

Do not adjust stock, archive items, dispose of batches, or run a repair/reconciliation action against live inventory.

### D. Staff, management, and administration

With a prepared staff account:

1. Manager reviews staff, attendance/leave, payroll, or operational reporting features relevant to the demonstration.
2. Admin reviews user/role management and audit/history screens. Do not create, disable, or change real user accounts.
3. Where permitted, compare the actions visible to one role with those visible to another role. Do not attempt unauthorized access, exploit endpoints, or perform penetration testing.

## 5. Indicator-by-indicator guidance

The indicator names below follow the supplied evaluation instrument. Suggested actions are prompts; rate only the portion you were able to observe.

### A. Functional Suitability

| Indicator | What to consider in Pawesome | Suggested observation |
|---|---|---|
| Functional completeness | Whether the available functions cover the task and role objectives relevant to the session. | Can the customer find and manage a service request? Can the staff role reach the part of its workflow needed for the demonstration? |
| Functional correctness | Whether results, statuses, amounts, and displayed records are correct for the test data. | Compare the submitted booking, visible status, payment/receipt details, or report totals with the expected test data supplied by the facilitator. |
| Functional appropriateness | Whether the functions help the user complete the task without unnecessary steps or confusing workarounds. | Observe whether the booking review, queue, POS, consultation, or report presents the information and actions needed at the point of work. |

### B. Performance Efficiency

| Indicator | What to consider in Pawesome | Suggested observation |
|---|---|---|
| Time behaviour | Perceived response and processing time during normal use. | Note load, search, save, and navigation responsiveness on the agreed device/network. Distinguish a system delay from the evaluator internet connection, Vercel edge, Railway service, or another live-environment condition. |
| Resource utilization | Whether the system appears to use device/browser resources reasonably during normal tasks. | Observe excessive browser freezing, memory/CPU pressure, or repeated reloads during the agreed session. A visual walkthrough cannot measure server resource use. |
| Capacity | Whether the system handles the expected volume or limits relevant to its intended use. | Only rate from a defined dataset, documented requirement, or approved load/capacity test. Do not infer capacity from a small demo dataset. |

### C. Compatibility

| Indicator | What to consider in Pawesome | Suggested observation |
|---|---|---|
| Co-existence | Whether Pawesome works in its shared device/browser/network environment without disrupting other software. | Observe normal use alongside approved browser tabs or peripherals if included in the test setup. Do not install software or connect equipment without permission. |
| Interoperability | Whether Pawesome exchanges and correctly uses information with other systems. | Assess only an actual, configured external connection or verified import/export exchange. Internal handoffs between customer, receptionist, cashier, vet, inventory, and manager show workflow continuity, not necessarily external interoperability. If no external integration is demonstrated, record that limitation. |

### D. Interaction Capability

| Indicator | What to consider in Pawesome | Suggested observation |
|---|---|---|
| Appropriateness recognizability | Whether the interface makes it clear that the system and page are suitable for the user's task. | Check whether role-specific navigation, page headings, and service choices help you identify where to work. |
| Learnability | How readily a first-time or infrequent user can learn the task. | Try one normal task with only the on-screen cues and brief standardized orientation supplied to all evaluators. Note where you needed help. |
| Operability | How easy it is to operate and control the task. | Try navigation, forms, search/filter, review, and return/back controls; note whether actions are predictable and state is understandable. |
| User error protection | Whether the system helps avoid, detect, and recover from mistakes. | Observe required-field validation, booking review, confirmation prompts, status restrictions, and understandable error messages. Do not intentionally create harmful records or payments. |
| User engagement | Whether the presentation is inviting and supports continued interaction. | Consider clarity, visual hierarchy, and whether the interface keeps attention on the task. Do not score only by personal color or style preference. |
| Inclusivity | Whether people with varied backgrounds, abilities, devices, and levels of experience can use the system. | If appropriate to your role, try a phone-sized viewport, browser zoom, keyboard navigation, and readable text. A short check does not establish formal accessibility conformance. |
| User assistance | Whether help, guidance, and feedback enable users with different characteristics to achieve their goals. | Look for useful field hints, status explanations, validation messages, onboarding, or available chatbot/help functions. Judge the help you actually used, not just the presence of a help icon. |
| Self-descriptiveness | Whether the system makes capabilities, current state, and next steps clear without excessive searching. | Check whether booking/payment states, totals, labels, and available actions explain what has happened and what the user can do next. |

### E. Reliability

| Indicator | What to consider in Pawesome | Suggested observation |
|---|---|---|
| Faultlessness | Whether normal, valid tasks complete without visible faults or incorrect states. | Complete an approved normal task and note errors, lost changes, inconsistent statuses, or unexpected behavior. |
| Availability | Whether the system can be reached and used when required during the evaluation. | Record access interruptions during the session. A brief demonstration does not establish long-term uptime or service-level availability. |
| Fault tolerance | Whether the system continues or fails safely in the presence of a fault. | Do not introduce faults into the live deployment. Rate only from approved existing evidence or a separately authorized non-production fault test; otherwise record as not observed. |
| Recoverability | Whether the user can recover from an interruption and whether affected data returns to a valid state. | On the live deployment, use only a blank page or isolated evaluator draft for a harmless reload check; do not interrupt an active transaction. Do not assume unsent email is delivered: queued, sent, provider-accepted, and delivered are different states. |

### F. Security

| Indicator | What to consider in Pawesome | Suggested observation |
|---|---|---|
| Confidentiality | Whether only authorized users can view the information relevant to their role. | Compare the screens and records available through the accounts provided. Use only approved accounts; do not probe another person's records. |
| Integrity | Whether data and business results remain accurate and protected from unauthorized changes. | Compare a prepared record before and after an authorized action; observe whether displayed totals/statuses remain consistent. Do not attempt tampering. |
| Non-repudiation | Whether evidence can support that an event or action took place. | Inspect available receipts, transaction references, or history for the approved test workflow. A receipt alone does not prove every action is non-repudiable. |
| Accountability | Whether actions can be traced to the responsible user. | Where authorized, inspect activity/history records for actor, action, and time on a prepared test record. |
| Authenticity | Whether the system can establish the identity of the person or account using it. | Observe normal sign-in, role identity, and session behavior. Do not test credential attacks or account takeover. |
| Resistance | Whether the system sustains operation during malicious attack. | This requires an authorized security assessment. Do not perform attack or penetration tests as part of this user evaluation. If no approved security evidence is supplied, mark as not observed and explain. |

### G. Maintainability

These indicators generally require source-code, architecture, test, or maintenance access. A user-interface-only demonstration is not enough to rate them.

| Indicator | What to consider in Pawesome | Suggested evidence |
|---|---|---|
| Modularity | Whether components can be changed independently with limited impact. | Architecture/module boundaries and a documented change-impact example; the role-based screens alone are insufficient evidence. |
| Reusability | Whether components or assets can be reused. | Shared components/services and a concrete reuse example, verified by an evaluator with technical access. |
| Analysability | How effectively maintainers can locate faults and understand change impact. | Review an issue-tracing or diagnostic example, logs, documentation, and test evidence. |
| Modifiability | Whether changes can be made efficiently without introducing defects or degrading quality. | Review a representative change and regression evidence; do not infer this from the technology stack alone. |
| Testability | Whether test criteria can be defined and tests can determine whether they are met. | Review test cases/results and traceability for a representative workflow. The project includes automated API, feature, and browser tests, but rate their adequacy only if you inspect the evidence. |

### H. Flexibility

| Indicator | What to consider in Pawesome | Suggested evidence |
|---|---|---|
| Adaptability | Whether the system can be adapted to different or evolving hardware/software/usage environments. | Try only the agreed browsers/devices or review documented environment support. A responsive screen alone does not prove broad adaptability. |
| Scalability | Whether it can handle growing or changing workloads. | Requires defined workload targets and controlled load/capacity results. Do not infer scalability from normal browsing or multiple role accounts. |
| Installability | How effectively it can be installed or removed in a specified environment. | Review an authorized deployment/install procedure in a non-production environment. End users normally cannot judge this from the hosted application. |
| Replaceability | Whether it can replace another product for the same purpose in the same environment. | Requires a defined comparison, migration/interchange plan, and replacement test. Do not infer this from feature similarity. |

### I. Safety

Pawesome supports pet-care operations but is not a substitute for professional veterinary judgment. Evaluate software safeguards and warnings only; do not judge clinical treatment decisions or perform animal-care procedures as part of this software evaluation.

| Indicator | What to consider in Pawesome | Suggested observation |
|---|---|---|
| Operational constraint | Whether actions are constrained to safe/valid states. | Observe required data, role permissions, booking/payment state rules, and inventory controls in an approved test workflow. |
| Risk identification | Whether the system identifies conditions that may expose people, animals, property, or the environment to unacceptable risk. | Look for relevant alerts such as low-stock/expiry warnings or clearly identified workflow hazards, if present in the prepared data. Do not assume these alerts cover clinical risks. |
| Fail safe | Whether the system returns to or remains in a safe state when a failure occurs. | Do not interrupt or disrupt the live deployment. Rate only from approved existing evidence or a separately authorized non-production test; otherwise record as not observed. |
| Hazard warning | Whether timely warnings let users respond to unacceptable operational risks. | Observe warnings and confirmation messages tied to an approved task. Note whether the warning explains the issue and the safe next step. |
| Safe integration | Whether safety is maintained during and after integration with other components. | Assess only an actual, configured integration included in the test. If no relevant integration or safety evidence is provided, record not observed rather than assuming compliance. |

## 6. Evidence and remarks

When a rating is notably high or low, add a concise note in the instrument's remarks section. Useful notes identify:

- The role/account type used (never the password).
- The page or workflow and the action attempted.
- What the system displayed or did, including any error or delay.
- Whether the result matched the facilitator's prepared test data.
- Any limitation of the test setup (for example, an unavailable integration or no load test).

Avoid writing real names, contact details, payment information, or sensitive pet/medical data in comments or screenshots. If the facilitator collects screenshots, use prepared test data and follow the project's privacy instructions.

## 7. Evaluator session record

Use this checklist to document the session alongside the evaluation instrument:

| Session detail | Record |
|---|---|
| Evaluation date | |
| Evaluator profession / specialization | |
| Live Vercel URL / paired Railway release / browser/device | |
| Roles/accounts actually used | |
| Workflows completed | |
| Workflows observed but not submitted/changed | |
| Features or indicators not observed | |
| Interruptions or environment limitations | |
| Additional comments | |

## 8. Guidance for the facilitator/research team

- Give evaluators equivalent orientation and test data so ratings are comparable.
- Supply separate, least-privilege accounts for the roles being evaluated; do not ask evaluators to share passwords.
- Demonstrate any workflow that is not safe for evaluators to execute, and label it as facilitator-demonstrated rather than evaluator-tested.
- Prepare expected outcomes for test bookings, amounts, statuses, and reports before sessions begin.
- Keep performance, load, security, installation, maintainability, and external-interoperability claims separate from ordinary end-user impressions; provide appropriate evidence or record them as not observed.
- Confirm that the approved questionnaire identifies Pawesome and uses respondent categories appropriate to the study. Agree with the research adviser how indicators that cannot be observed will be recorded; do not alter the approved scoring procedure without approval.
- Coordinate the live Vercel frontend and its paired Railway backend before evaluation; do not infer live deployment readiness or test safety from repository settings alone.

## System references for the research team

- `docs/RBAC_PERMISSION_MATRIX.md` — role permissions and composite-role behavior.
- `docs/EVALUATION_EVIDENCE.md` — recorded workflow evidence and known limits; evidence should be rechecked against the specific evaluation build.
- `frontend/src/routes/` — current customer, receptionist, cashier, inventory, veterinary, manager, admin, and super-receptionist application routes.
- `documentation/PAWESOME_SYSTEM_USER_GUIDE_IT_EVALUATORS.md` - task-oriented instructions for using the live evaluator deployment.
