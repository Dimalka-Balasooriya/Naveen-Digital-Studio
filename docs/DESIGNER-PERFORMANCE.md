# Designer Performance Report

Route: `/admin/designer-performance`. API: `GET /api/designer-performance` and `GET /api/designer-performance/export`. Both require existing OWNER (main admin, including ADMIN alias) or CO_ADMIN authentication. DESIGN_TEAM, production employees and Calling Agents cannot access either API. No new role or login.

## Data and definitions

No migration is required. The read-only report reuses `order_status_history`, `order_assignments`, `orders`, `order_statuses`, `employees` and `roles`. Existing `recordStatusChange` and `recordOrderAssignment` already automatically write transition actors/timestamps and assignment intervals. `assignment_history` was inspected but its new employee is non-nullable and does not cover unassignment; the start/end intervals in `order_assignments` are more reliable. `order_activity` contains free text rather than a dependable status timeline. No new tracking writes, status values, commission updates or backfills were added.

- Exact statuses: New, Editing, Editing Done, Correction and Correction Done.
- Assigned orders: distinct orders whose main assignment starts within the selected range, per designer. Team distinct counts are deduplicated across designers.
- Editing Done: distinct orders and separate genuine transition events. Consecutive duplicate/same-status history rows do not produce additional completions.
- Editing completion credit: designer actor when recorded, otherwise the designer assigned at that instant when an admin changed status. The actual actor and assigned designer are retained separately in event details.
- Correction completion credit: actual designer actor only, including Shared Correction Panel completions. Never credit the assigned designer instead of the recorded actor. Admin correction actions with no designer actor are reported as an attribution gap.
- Total duration: latest recorded New or main assignment cycle start through Editing Done. Reassignment resets the cycle. Reopening without a new New/assignment event does not reuse an old completed cycle's start.
- Waiting: cycle start through the first recorded Editing entry in that cycle.
- Editing: latest uninterrupted recorded Editing entry through Editing Done. It is elapsed time, not accumulated active working hours. An interruption followed by another Editing entry starts a new editing segment.
- Durations require reliable assignment and matching credited designer. Missing Editing means waiting/editing N/A even if total duration is known. Conflicting history, overlapping assignments and same-second reassignment/status ambiguity exclude affected durations. Each average/minimum/maximum uses only valid event samples; zero is valid and N/A is not zero.

## Dates and pending state

Parameters: `start=YYYY-MM-DD`, `end=YYYY-MM-DD`, optional positive `designer_id`. Default today. Maximum 93 days, no future dates. All date boundaries are Asia/Colombo (+05:30), start-inclusive/end-exclusive. MySQL TIMESTAMP values are selected as UNIX_TIMESTAMP milliseconds; calculations do not depend on the Node host timezone.

Historical pending counts use the last recorded status before the end of each day and the assignment interval active at that cutoff. They never use today's status as a substitute for an unknown past state. Current-day pending counts use the current order snapshot. Date-range pending cards/table use the final day snapshot, not the sum of daily inventories. Daily snapshots are available on screen and in Excel, including individual designer counts in Excel.

Historical uncertainty is explicit. Missing status/assignment history, contradictions with a subsequent transition/current snapshot, and archives with no recorded archive time are listed as gaps. Pending counts are known counts and can be lower bounds; unknown order counts remain team-wide under a designer filter because ownership cannot safely be inferred. Historical deleted orders with a recorded deletion timestamp are included before deletion and excluded thereafter.

Limitations: main order assignments are authoritative; task-only assignments cannot establish a unique main designer. Employee roles/names and status names are not historically versioned. Hard-deleted orders/history cannot be reconstructed. Undetectable past edits to otherwise coherent history cannot be recovered. No historical timestamps are invented. If older installations lack history, the report cannot create reliable past performance retroactively.

## UI / export

Today, Yesterday, custom date, range and designer filters; summary cards; individual table; distinct completed orders chart; paged expandable completion details; daily pending snapshots; historical gaps. Excel includes all selected event details, totals, daily per-designer counts, sample counts and limitations. Print uses landscape, hides navigation/controls and prints the current 25-event detail page; use Excel for the full event list. Errors, loading, empty and N/A states are provided.

The API uses parameterized filters and a consistent read-only transaction. Interactive dataset limits are 10,000 orders and 200,000 rows each of assignment/status history; exceeding a limit returns 422, never silently truncated totals. Larger installations need an offline/aggregated reporting job. Date filtering requires earlier history to reconstruct cycles and pending states, so selecting fewer days does not necessarily reduce that underlying history.

## Validation

```powershell
npm run test:designer-performance --prefix server
npm run test:designer-performance --prefix client
$env:PERFORMANCE_TEST_MYSQL='1'
$env:PERFORMANCE_TEST_PORT='53317'
npm run test:designer-performance:integration --prefix server
npm run test:corrections --prefix server
npm run test:calling --prefix server
node --test server/test/production-status.test.js
npm run build --prefix server
npm run build --prefix client
```

The integration suite explicitly opts into a disposable 127.0.0.1 MySQL instance on a nondefault port, creates its own synthetic database and removes only that database afterward. It does not load production connection settings. Tests cover role protection (including export), Colombo boundaries, historical snapshots, duration exclusions, duplicates/reopens/reassignment, shared correction credit, valid Excel output and unchanged source tables.

Validation results: 48 unit/render tests passed (16 designer-report backend, 4 designer-report frontend, 2 correction, 20 Calling Agent, 2 production-status and 4 Call Now). MySQL/HTTP suites passed: 6 designer-report, 9 correction and 13 Calling Agent tests, including suite parents. Backend build and whitespace checks passed. The standard frontend build passed initially; after the final print change its config loader hit the intermittent Windows directory-permission error. The final source passed the equivalent programmatic Vite build with the same config (`configFile:false`), without changing application configuration. Existing Browserslist age and large-bundle warnings remain nonblocking. No interactive browser or physical printer validation is claimed.

Changed files: client `package.json`, `src/App.jsx`, `src/components/DashboardLayout.jsx`, `src/pages/admin/DesignerPerformanceReport.jsx`, `src/utils/designerPerformance.js`, `test/designer-performance.test.js`; server `package.json`, `src/app.js`, `src/routes/designer-performance.routes.js`, `src/services/designer-performance.js`, `src/services/designer-performance-data.js`, `test/designer-performance.test.js`, `test/designer-performance-integration.test.js`; this document.

No production access, production migration, commit, push or deployment is part of this implementation. A6 printing, Calling Agent, Shared Correction Panel, Design Team status rules, commissions and assignments remain unchanged.
