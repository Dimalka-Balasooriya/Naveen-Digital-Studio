# Shared Correction Panel

The existing DESIGN_TEAM login can open `/correction` from the Correction sidebar item. Other roles cannot use this page or its API. No new role or login is introduced.

The paginated queue includes only nondeleted, nonarchived orders whose production status is exactly `Correction` and which have a designer assignment. It prefers the existing main designer assignment and falls back to the existing current designer assignment record. It displays the order/customer/product information, assigned designer, design notes, latest correction status note, applicable Calling Agent correction note, priority, and status. Fast orders sort first, then needed date, creation time, and ID. The Calling Agent flag alone does not add an order to the queue or change production status.

Any active DESIGN_TEAM employee can complete a queued correction through the dedicated endpoint. This changes only production status to the existing `Correction Done` status and appends existing status-history and order-activity records. The audit records identify the completing employee and timestamp. The existing workflow has no commission side effect for this status; assignments, progress, commissions and calling state are left intact. Ordinary order modification permissions are unchanged.

The original designer retains the order on the Production Dashboard. That dashboard refreshes assigned orders every 15 seconds while visible, on window focus and after a same-window correction action. Existing status filters still apply. The shared queue and sidebar count refresh on the same cadence; the completing client removes the card immediately after success and refreshes the count. An order that later returns to Correction reappears.

## API

- `GET /api/corrections?page=1&limit=25`: shared pending orders and pagination (maximum 100 per page).
- `GET /api/corrections/count`: shared pending count.
- `POST /api/corrections/:id/complete`: body `{ "expected_history_id": 123 }` from the listed order's `correction_history_id`. No arbitrary status, assignment or progress field is accepted.

All three endpoints require authenticated DESIGN_TEAM users. Completion locks the order row and rechecks status, eligibility and the latest existing history ID in a transaction. Concurrent/duplicate requests or a stale request from an earlier correction round receive 409. State and both audit inserts commit together; failures roll back. Missing Correction Done configuration is reported without creating statuses. A lost response can be resolved by refreshing; retry cannot create a second completion for the same pending round.

## Database

**No new migration is required.** This feature uses the existing orders, roles, employees, assignments, products, customers, order_status_history, order_activity and Calling Agent state/history tables. It assumes the existing release's baseline and Calling Agent migrations are already installed. No new status, table or column is created by this feature. Do not run seed/reset scripts to enable it.

## Validation commands

```powershell
npm run test:corrections --prefix server
$env:CORRECTION_TEST_MYSQL='1'
$env:CORRECTION_TEST_PORT='53317'
npm run test:corrections:integration --prefix server
npm run test:calling --prefix server
node --test server/test/production-status.test.js
npm run build --prefix server
npm run build --prefix client
```

The opt-in integration test connects only to 127.0.0.1 on an explicitly selected nondefault port, with the disposable local instance's root account. It creates and removes its own uniquely named synthetic database. It never reads production DB settings. Tests cover authorization, shared eligibility/notes/pagination/counts, another designer completing an order, preserved assignments/commissions/calling state, original-dashboard synchronization, repeated corrections, stale and concurrent requests, rollback and missing status configuration. Without explicit opt-in it skips.

Local validation: both correction unit tests and all eight MySQL/HTTP scenarios passed (nine TAP tests including the parent); the 20 Calling Agent unit tests, 13 Calling Agent MySQL/HTTP regression tests (including the parent), and two production-status regressions passed. Backend build and syntax checks passed. The standard frontend CLI encountered the existing Windows esbuild config-loader directory-permission error; the same Vite config was loaded directly through the local test build wrapper for frontend build validation. Existing bundle-size/Browserslist warnings are unrelated.

No production migration, commit, push or deployment was performed.
