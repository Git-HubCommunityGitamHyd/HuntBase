# HuntBase Frontend Integration Audit

## 1. Current checkout

- Branch: `staging-build-v1`.
- The working tree already had numerous tracked edits and untracked files at inspection time, including API routes, middleware, database/auth helpers, player/admin pages, scripts, and reports. They were preserved. This audit adds this report and targeted fixes listed in section 5.
- This documents the current local checkout only. Sai's PR and teammates' latest remote work were not independently verified.
- The earlier local demo context was manually exercised; the preview has since been removed because it bypassed page-level authentication.

### Local demo authentication boundary

- The prior localhost `?demo=1` preview bypass has been removed. The middleware no longer reads demo query parameters or a demo cookie; `/hunt`, `/scan`, `/progress`, and `/admin/*` require a signed session with the correct role, including during development.
- Player session hydration now validates the signed server session through `/api/auth/me`; cached `localStorage` values do not establish identity. `/api/auth/me` returns a player/team pair only when the signed player ID and team binding still match database records. Admin login continues to use its existing `{ success, admin }` response.
- The sample preview provider/components and homepage preview links have been removed. No preview route currently grants or imitates authenticated access.
- Protected player API handlers check the signed session and bind player requests to the session team. Admin API handlers perform handler-level session/role checks; organization-scoped handlers compare the session organization with the requested resource. The existing checks were source-reviewed; only the targeted auth tests listed in this report establish executed evidence.
- This local source review is not a deployment security certification. Valid database-backed login and tenant-isolation flows still require testing against a non-production database and real session cookies.

## 2. Existing frontend pages

| Area | Current implementation | Status / evidence |
|---|---|---|
| Homepage | HuntBase entry page and navigation | Implemented. |
| Player login | Posts credentials and stores returned player/team in `AuthContext` | Implemented; refresh restores the player from the signed session through `/api/auth/me`; database-backed flow still needs integration testing. |
| Registration | Fetches available teams, validates fields, posts registration, directs player to login | Implemented. No email verification screen or OTP flow found in the scoped auth routes. Team-list loading has a visible error and retry state. |
| Hunt | Fetches team/current clue; displays score, clue, timer, delayed hint state, and scanner navigation; polls/focus-refreshes team state | Implemented with loading, missing-team/clue, retry, waiting, disqualified, timeout, completion, and hint error states. Timer and live synchronization still depend on backend timestamps and polling responses. |
| Scanner | Camera start/pause, manual entry, processing lock/overlay, success/error messages, and permission-specific guidance | Implemented. Camera hardware/permission behavior and QR flow were not runtime-tested in this audit. |
| Progress | Displays score, clue progress, and scan history; polls progress; empty scan-history message | Partially implemented: no leaderboard found; fetch failures have visible feedback and retry. |
| Admin Events | Event create/edit/delete and start/stop controls | Implemented, with loading and form success/error states. Some list/toggle/delete fetches do not check HTTP status; initial fetch failure can look like an empty list. |
| Admin Clues | Create/edit/delete/reorder clues and configure hint text | Implemented. Reorder uses two writes and may partially succeed if the second request fails. |
| Admin Teams | Create/delete teams, roster operations, disqualification, score adjustment, password reset, export | Implemented with source-level admin/session and tenant checks; verify mutations against a non-production server. Password reset success does not echo the submitted password. |
| Admin QR Codes | QR token preview, fake QR management, and ZIP generation | Implemented with source-level admin/session and tenant checks; verify mutations against a non-production server. |
| Admin Live Monitor | Team/clue/fake-scan data, polling, timer, disqualification, score and event controls | Implemented. Polling is five seconds, with visible fetch/action errors. |
| Admin demo preview | Removed | The prior preview route was disabled with the authentication bypass; admin pages now require a signed admin session. |
| Leaderboard / theme customization | No player leaderboard or theme-customization flow found in the scoped pages | Missing. Do not add until there is a confirmed requirement and source of truth. |

The UI largely shares the black/zinc/white visual language. Hunt and scan have narrow-screen layouts; QR camera behavior needs an actual mobile-device check. Source presence alone does not establish runtime success.

## 3. API contract map

Contracts below are read from the local route handlers and matching frontend calls. Admin routes rely on the current middleware's `/api/admin/*` session/role protection; this audit does not certify that multi-tenant authorization is complete. Error response shapes vary and commonly use `{ success: false, message }`.

| Screen / action | Method and path | Request / response observed in source | Auth and UI behavior |
|---|---|---|---|
| Player login | `POST /api/auth/login` | `{ username, password }` → `{ success, message, player, team }` on success; sets signed session cookie | Public. Form shows loading and error, then calls `AuthContext.login`. |
| Registration team list | `GET /api/teams/available` | → `{ success, data: [{ id, team_name, current_members, max_players }] }` | Public. Initial failure is logged; no visible retry. |
| Registration | `POST /api/auth/register` | `{ team_id, player_name, username, password }` → `{ success, message, data: { id, player_name, username, team_name } }` | Public. Form validates locally and displays errors; player must then log in. |
| Logout | `POST /api/auth/logout` | No body → `{ success, message }`; clears session cookie | Public session operation. Player `AuthContext.logout` now calls this route before clearing its local identity; admin layout already did so. |
| Current team | `GET /api/teams/[id]` | Path ID → `{ success, team }` | Handler uses `getSession`; player is limited to own team, admins may access any team. Used by Hunt/Progress/AuthContext. |
| Current clue | `POST /api/hunt/current-clue` | `{ team_id }` → `success`, `isComplete`, `clue`, `clueOrder`, `totalClues`, `currentStep`, `score`, `event` | Handler checks the signed player session and requires `team_id` to match its bound team. |
| View hint | `POST /api/hints/view` | `{ team_id, clue_id, player_id? }` → hint text on first view; already-viewed response may omit `hint_text` | Handler checks the signed player session and binds the team. Hunt gates by returned timer and displays API errors. |
| Submit scanned QR | `POST /api/scan` | `{ token, team_id }` (handler accepts optional `player_id`) → success fields include `newScore`, `nextStep`, `isComplete`, `pointsEarned`, `hintUsed`; decoys return `isFake`, `redirect_url`, `fake_label`, `message` | Handler requires a signed player session and binds the submitted team to it. Scanner locks duplicate submissions and displays results. |
| Hunt progress | `GET /api/hunt/progress?team_id=...` | → `{ success, totalClues, scans: [{ id, scanned_at, clue_id, clue: { location_name } }] }` | Handler checks session and binds player to own team. Progress shows scan history/empty state. |
| Admin Events | `GET/POST/PUT/DELETE /api/admin/events` | GET → `{ success, data }`; POST event fields `name,start_time,end_time,hunt_duration_minutes,hint_delay_minutes`; PUT `{ id, ...updates }`; DELETE query `?id=` | Admin middleware. UI supports CRUD; start/stop are `POST /api/admin/events/start-hunt` and `/stop-hunt` with `{ event_id }`. |
| Admin Clues | `GET/POST/PUT/DELETE /api/admin/clues` | GET `?event_id=`; POST `{ event_id, step_number, clue_text, location_name, hint_text, admin_notes }`; PUT `{ id, ...updates }`; DELETE `?id=` | Admin middleware. UI supports CRUD/reorder; failures on some paths are not surfaced. |
| Admin Teams / score | `GET/POST/PUT/DELETE /api/admin/teams`; `POST /api/admin/teams/score` | Team GET uses `?event_id=`; create `{ event_id, team_name, min_players, max_players }`; PUT `{ id, ...updates }`; score adjustment `{ team_id, adjustment }` → `{ success, message, new_score }` | Admin middleware. Team score UI was changed to use the existing adjustment endpoint rather than send an absolute score to the collection endpoint. |
| Admin roster | `/api/admin/players`, `/api/admin/players/[id]`, `/move`, `/reset-password`, `/export` | UI uses GET players by `team_id`, DELETE player by ID, PUT move with `{ new_team_id }`, POST reset with `{ player_id, new_password }`, GET export by `event_id` | Drizzle-backed handlers perform session/role checks and organization scoping in source; runtime database behavior is unverified. |
| Admin monitor | `GET /api/admin/monitor?event_id=...`; `GET /api/admin/fake-qr-scans?event_id=...&limit=20` | Monitor rows include `team_id, team_name, score, current_step, is_disqualified, last_scan_at, clue_location`; fake scan list is returned for display | Admin middleware and handler session checks observed. UI polls every five seconds; polling errors only log to console. |
| Admin QR | `GET/POST/DELETE /api/admin/qr/fake`; `GET /api/admin/qr/token?clue_id=...`; `POST /api/admin/qr/generate` | Fake QR create `{ event_id,label,redirect_url }`; token responds `{ success, token, exists }`; generate `{ event_id }` → ZIP payload fields including `zipBase64, clueCount, fakeCount` | Drizzle-backed handlers perform session/role checks and organization scoping in source; runtime database behavior is unverified. |

No frontend calls to an email OTP/verification endpoint were found in the scoped auth routes. `/api/auth/me` supports both player and admin sessions and returns data only after verifying the signed cookie; its player branch checks the signed player/team binding against database rows.

## 4. Integration mismatches and risks

### High — resolve before a real hunt

- **Player authorization is source-implemented but needs live verification.** Current-clue, hint-view, and scan handlers check signed player sessions and bind submitted team IDs. The added regression tests call these handlers for unauthenticated and cross-team requests, but complete database-backed gameplay has not been tested.
- **Organization isolation is implemented in source but needs runtime tests.** Admin handlers verify the signed role and compare the session organization with target event/team/clue/QR/player resources. Cross-organization requests still need HTTP testing against a non-production database.
- **Sensitive response fields:** inspected admin team/player queries use explicit field lists. Continue checking response shapes when adding fields; credential columns must never be returned.
- **Legacy database artifacts remain:** active application route imports use the Drizzle/PostgreSQL layer. The repository still contains legacy Supabase schema/documentation, which should not be mistaken for the active runtime architecture.
- **TypeScript check is still blocked by `bcryptjs` resolution.** The reset-password route imported `hashPassword` from a helper that does not export it; this now imports the existing hasher at `src/lib/auth/password.ts`. The `pg` query helper now constrains its result type to `QueryResultRow`, and the monitor route declares query row types. The remaining error is explained by `bcryptjs` being declared in `package.json` but absent from `node_modules` and the current lockfile. No dependency install or lockfile edit was made because those files already contain uncommitted changes.

### Medium

- Dynamic update handlers interpolate request object keys into SQL identifiers for event/clue/team updates; backend owners should restrict keys to allowed columns.
- LocalStorage retains a display cache, but player session restoration verifies `/api/auth/me`; middleware and handlers use the signed cookie for authorization. Database/session expiry behavior still needs live integration testing.
- Current-clue and hint responses are not fully uniform: `has_hint` is optional and repeated hint views may omit the text. Frontend should continue treating these fields as optional until backend contract is confirmed.
- Several admin initial-load and mutation failures are console-only or unchecked, so a failed request may look like empty/successful data. Make response/error handling consistent after contract review.
- `FRONTEND_IMPLEMENTATION_CHECKLIST.md` is stale where it says Hunt/Progress/Monitor use Supabase realtime: current inspected pages poll API routes instead.
- The previous sample preview was removed because it bypassed page-level authentication. Local testing now uses the real login/session flow.

No security vulnerability or real database integration was dynamically tested. Risks above require source review and owner confirmation.

## 5. Changes made in this audit

- `src/contexts/AuthContext.tsx`: player logout calls the existing `POST /api/auth/logout` route so the signed cookie is cleared as well as localStorage/client state. Session restoration now validates through `/api/auth/me` instead of treating the cached localStorage identity as authentication.
- `src/app/admin/teams/page.tsx`: score adjustments use the existing `POST /api/admin/teams/score` contract and surface a failed response; reset-password success feedback no longer repeats the submitted password.
- `src/app/api/admin/players/reset-password/route.ts`: imports the existing hash helper from its actual export location; route contract and authorization are unchanged.
- `src/lib/db.ts` and `src/app/api/admin/monitor/route.ts`: constrain query result typing and type the monitor rows; response fields remain the same (timestamp values are represented as ISO strings in JSON as before).
- `scripts/test-access-control.ts`: its static query-order assertion now recognizes a generic call such as `query<MonitorScanRow>(...)`; it had falsely failed after the typing correction.
- `FRONTEND_INTEGRATION_AUDIT.md`: this report.

No API contract, authorization rule, schema, gameplay logic, database connection behavior, or dependency was changed for this audit. The two API route edits are compile-time typing/import corrections only.

## 6. Checks and environment

- `npm.cmd run lint -- src/contexts/AuthContext.tsx src/app/admin/teams/page.tsx src/app/api/admin/players/reset-password/route.ts src/lib/db.ts src/app/api/admin/monitor/route.ts scripts/test-access-control.ts` — exit 0, no errors; three existing unused-variable warnings remain in the test file.
- `git diff --check` — passed; Git emitted only existing LF-to-CRLF working-copy warnings.
- `npm.cmd test` — final run passed 44 tests, failed 0, skipped 1. The HTTP tests were skipped because `TEST_BASE_URL` was unset. Earlier in the same investigation, an invocation failed before tests because `tsx` called `node:os.userInfo()` and Node returned `uv_os_get_passwd ... ENOMEM`; a direct `node:os.userInfo()` call reproduced that environment error, while subsequent `npm test` runs started normally. This indicates an intermittent environment account-lookup/startup failure, not a test assertion result.
- `npm.cmd exec -- tsc --noEmit --incremental false` — now reports only `TS2307` for missing `bcryptjs` module/type declarations in `src/lib/auth/password.ts`; reset-password import and `pg` generic errors are resolved. `bcryptjs` is present in the dirty `package.json` but absent from both `node_modules` and the dirty `package-lock.json`. Installing it and syncing the lock are needed to complete typechecking; deferred to avoid mutating existing dependency work.
- No frontend/browser automation or live Neon/email/camera/gameplay integration was run. Test files exist for session security and access control; the latter has optional HTTP checks gated by `TEST_BASE_URL`.
- `.env.template` lists `NEON_DB_HOST`, `NEON_DB_PORT`, `NEON_DB_NAME`, `NEON_DB_USER`, `NEON_DB_PASSWORD`, `NEXT_PUBLIC_APP_URL`, `SESSION_SECRET`, and `BCRYPT_COST`. This audit did not inspect or print local secret values. Actual runtime configuration was not validated.
- Dependencies were not installed.

## 7. Questions for Sai and Owais

1. Confirm the remaining API response details for already-viewed hints and optional hint fields.
2. Which handlers have completed the Neon/Drizzle migration, and who owns the still-Supabase-backed admin player and QR fake/token routes? What schemas and response contracts should the frontend target?
3. Are all admin queries scoped to the authenticated organization, and which exact response fields may be returned for teams/players?
4. Should score adjustments always use `{ team_id, adjustment }` at `/api/admin/teams/score`, and what is the expected conflict/error status behavior for concurrent adjustments?
5. Can the dependency owner reconcile the declared `bcryptjs` dependency with the lockfile and local install so password hashing typechecks?

## 8. Prioritized integration checklist

1. **Critical:** Run session-binding and organization-scope checks against a safe non-production server/database and confirm every admin query/mutation remains tenant-scoped.
2. **High:** Agree on one Neon-backed contract and migration owner for player roster and QR fake/token endpoints; reconcile `bcryptjs` in the lock/install before rerunning TypeScript.
3. **High:** Add/run HTTP contract tests for login, registration, scan, hint, progress, and admin writes against a safe local server/database.
4. **Medium:** Normalize frontend checks for `response.ok` and `{ success }`, and show retryable errors on admin initial loads and all mutations.
5. **Medium:** Run an end-to-end local smoke test with a seeded non-production event: register/login → start hunt → load clue → wait/reveal hint → scan valid/invalid/decoy QR → verify score/progress → monitor updates → logout/session expiry.
6. **Medium:** Test camera permissions and manual code entry on a mobile browser; verify responsive admin table behavior.

### Next three actions

1. Ask Sai/Owais to add/confirm signed-session identity binding for current-clue, hint-view, and scan, plus tenant scoping for admin queries.
2. Reconcile the declared `bcryptjs` package with the lockfile and local install, then rerun `tsc` and the HTTP access-control checks against an isolated local server.
3. Exercise the complete hunt flow against an isolated local Neon database and real mobile camera/browser before the demo.
