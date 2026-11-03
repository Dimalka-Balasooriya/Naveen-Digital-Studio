Calling Agent Management — implementation report

Prepared as an independent Calling Agent release based on f8d12848ae10a9f7bbc3d37c3b9353503361ae11.
No commit, push, deployment or production database migration was performed. The original checkout is preserved. Database validation used an isolated disposable MySQL instance with synthetic data.

Behavior

- New CALLING_AGENT accounts use the existing Employees page, password hashing, activation/deactivation and soft deletion. The repository calls its main administrator OWNER; OWNER and CO_ADMIN can manage calling accounts. No additional MAIN_ADMIN role was invented.
- Calling agents land at /calling after login. The dashboard route and queue/update API require CALLING_AGENT. Existing administrators use their Orders page for visibility, not the calling dashboard.
- The queue includes only exact, case-sensitive Editing Done and Correction Done order-status names, excludes deleted/archived orders, and never updates those production statuses. No grouped status matching or new production status is introduced.
- Calling status is independent: Not Called, No Answer, Call Back, Confirmed, Wrong Number, Completed.
- Priority: Not Called first, then Call Back, then No Answer, then all three remaining statuses in one group. Each group sorts oldest eligible first, then by order ID for deterministic ties.
- Eligibility age is the most recent genuine transition into the order's current eligible status (from existing order_status_history); legacy orders without such history fall back to order creation time.
- The dashboard shows customer/recipient phone, customer name, database ID, NDS order number, production status, saved calling status, optional notes and paginated call history. Filters are All, Editing Done and Correction Done. Queue pages default to 25, history pages to 20; the API caps pages at 100 rows.
- Refresh reads saved state. Calling data is retained when an order leaves/re-enters an eligible production status; it is not automatically reset.
- Admin Orders now has a Calling Status column and a paginated calling-history section in order details. Existing actions, assignment, commissions, production progress, and status-change menus are unchanged.
- No Twilio, VoIP, dialer, automatic phone call, new credential or dependency is introduced.

Changed files (paths relative to the repository above)

| File | Change |
| --- | --- |
| client/src/pages/calling/CallingDashboard.jsx | New agent queue, filtering, pagination, status/notes updates, safe retry and refresh. |
| client/src/components/CallingHistory.jsx | Shared paginated history for agents and admin order details. |
| client/src/App.jsx | Role-protected /calling route and role-aware landing redirects. |
| client/src/utils/roles.js | Shared homePath helper preserving existing admin/production destinations. |
| client/src/components/DashboardLayout.jsx | Calling-agent navigation; skips inaccessible message requests/links for that role. |
| client/src/pages/admin/EmployeesPage.jsx | CALLING_AGENT option in the existing employee form. |
| client/src/pages/admin/OrdersPage.jsx | Calling status column and history panel only. |
| server/src/app.js | Mounts /api/calling. |
| server/src/middleware/auth.js | Restricts the new role to auth/calling APIs, including legacy endpoints that previously accepted any authenticated user. Existing roles retain their prior behavior. |
| server/src/routes/employees.routes.js | Accepts CALLING_AGENT in employee create/edit validation. |
| server/src/routes/orders.routes.js | Left-joins calling state in list/detail queries; absent state is Not Called. |
| server/src/routes/calling.routes.js | Paginated queue/history and agent-only update endpoints. |
| server/src/services/calling.service.js | Eligibility, sorting, validation and transactional state/history/idempotency logic. |
| server/src/scripts/apply-calling-migration.js | Explicit, additive, idempotent migration. |
| server/package.json | Adds migrate:calling and test:calling; preserves existing scripts. |
| server/test/calling.test.js | 18 focused tests with mocked database connections. |
| server/test/calling-release-regression.test.js | Opt-in disposable MySQL migration, transaction, permission and existing order regressions. |
| docs/CALLING-AGENT-MODULE.md | This implementation/operations guide. |

Migration

Run explicitly against the intended database before enabling this version of the application. The admin order list now joins the new state table, so the migration must precede the updated server.

The migration inserts CALLING_AGENT into roles if missing, creates three InnoDB tables if absent, and adds a supporting status-history index only if absent:

- order_calling_state: one row per touched order, calling_status (default Not Called), version, updated_at.
- order_calling_requests: unique UUID request_id, order_id, agent_id, payload_hash, created_at. Retained to recognize repeated requests, including no-op requests.
- order_calling_history: immutable appended history containing order_id, previous_status, new_status, agent_id, request_id, notes and changed_at. Foreign keys do not cascade-delete this audit data.
- idx_calling_eligible_history on existing order_status_history(order_id, to_status_id, changed_at).

Existing orders need no backfill: LEFT JOIN plus COALESCE returns Not Called/version 0 until their first change. The migration neither updates existing order rows nor modifies production statuses/history. It can be rerun after an interrupted installation. It assumes the existing application's prior base migrations have been installed. The queue uses the existing recipient_contact_number column supplied by database/order-print-contact-fields-migration.sql. Validation applied the baseline schema and that pre-existing migration before the calling migration, with no courier integration migration or courier API configuration. MySQL DDL implicitly commits; take a database backup and allow for an index/schema lock on large order_status_history tables. Run the calling migration before starting the updated server because existing admin order queries now join order_calling_state. A partial run can be retried; CREATE TABLE IF NOT EXISTS does not repair an incompatible pre-existing table schema.

API and permissions

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| GET /api/calling/orders | CALLING_AGENT only | Eligible queue; page, limit, production_status and optional calling_status filters. |
| PATCH /api/calling/orders/:id/status | CALLING_AGENT only | Save status/notes with request_id and expected_version. Actor ID comes from authenticated user, not input. |
| GET /api/calling/orders/:id/history | CALLING_AGENT, OWNER, CO_ADMIN | Paginated immutable audit. Agents require the order to remain eligible; administrators can inspect historical orders after they leave the queue. |

Update body:

```json
{
  "status": "Call Back",
  "notes": "Customer asked for a later call",
  "expected_version": 0,
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Use a fresh UUID for each intended update; use the same body and UUID when retrying an unconfirmed response. The sample UUID is illustrative. Notes are optional and limited to 2,000 characters. The API rejects unexpected fields, invalid statuses and stale versions.

Transaction and duplicate guarantees

An order row lock serializes simultaneous calling changes and checks current eligibility before a new write. State, version, request record and history insert commit together. A failed history insert rolls all of them back. Updates never write orders.status_id, production_progress, commissions or order_status_history.
The unique request UUID plus agent/order/payload match makes retries idempotent even after intervening updates. A duplicate request does not revert a later status. Reusing a UUID for different input returns 409. A version mismatch returns 409 and asks the user to refresh before retrying. Two agents cannot silently overwrite each other.
Saving an unchanged status is a no-op (no duplicate history); the request is still recorded so a later retry cannot become a new action. The UI disables unchanged-status saves. Notes accompany genuine transitions; a notes-only update is not a separate activity in this version.

Validation results

- npm run test:calling --prefix server: 18/18 passed. Covers exact eligibility and filters; bounded pagination; priority groups; all six statuses; append-only history; lost-response retries; same-status no-op; changed-payload/actor UUID reuse; concurrent duplicate requests; competing agents; transactional rollback; deleted/archived/ineligible orders; missing orders; migration reruns; route permissions; paginated queue/admin history; OWNER/CO_ADMIN employee create/edit; password hashing; frontend landing routes; unauthorized legacy API access and unauthenticated access.
- npm run test:calling:integration --prefix server with CALLING_TEST_MYSQL=1 and CALLING_TEST_PORT=53317: passed all nine real MySQL/HTTP checks (10 TAP tests including the parent). Migration rerun, unchanged pre-existing data, exact eligibility, queue ordering, pagination, persistence, idempotency, concurrent conflict, rollback, role permissions, admin order list/detail/edit, existing Correction filter and production status changes passed.
- npm run build --prefix server: passed; explicit node --check also passed for the new service, routes, migration and modified auth/employee files.
- npm run build --prefix client: passed after final UI changes, 2,458 modules. Nonblocking warnings: existing bundle above 500 kB and outdated Browserslist data.
- git diff --check for application files: passed.

The original 18 tests use mocked SQL connections and route handlers. The added integration test creates and drops a uniquely named synthetic database on an explicitly supplied local non-default port; it never uses application DB credentials. Start a dedicated disposable MySQL instance, then set CALLING_TEST_MYSQL=1 and CALLING_TEST_PORT to that instance port. The test requires its local root account with no password. Without explicit opt-in it skips. Real MySQL 9.2 migration and HTTP tests passed. An authenticated browser UI acceptance check is still recommended on staging.

Later deployment/activation (not executed)

Use the existing deployment directory and process manager. No new environment variables or dependencies are required.

From the repository root on the intended server, after placing the reviewed code and confirming the backend database configuration:

```bash
npm run test:calling --prefix server
npm run build --prefix server
npm run build --prefix client
npm run migrate:calling --prefix server
```

Then restart the existing backend and publish client/dist through the project's established deployment procedure. The repository does not identify the DigitalOcean directory, process/service name or static asset destination, so these should not be guessed. Do not run seed/reset scripts.

Staging acceptance

1. Apply the calling migration to an isolated staging database and run it again to confirm idempotency.
2. As OWNER/CO_ADMIN, create an active Calling Agent through Employees. Verify edit/deactivate works.
3. Sign in as that account: it should land on /calling. Direct access to admin/production pages should redirect; general order/employee APIs should return 403.
4. Prepare staging orders with Editing Done, Correction Done, Editing, Correction and Correction Send. Only the first two should appear; test both filters and multiple pages.
5. Save Call Back with a note, refresh, then inspect history from both the calling page and admin order details. Verify original production status/progress/commissions did not change.
6. Verify queue priority and eligibility-age ordering. Terminal calling statuses remain eligible but sort last.
7. Open the same order with two agents. After one saves, the other's stale save must report a conflict; refresh and retry intentionally.
8. Repeat an identical request UUID/body: history must remain unchanged. Test an order leaving the eligible statuses and verify further updates are rejected.
