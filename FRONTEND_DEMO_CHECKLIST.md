# HuntBase Review 1 Frontend and Integration Checklist

## Checkout

- Branch: `staging-build-v1`.
- The tree contains many existing uncommitted frontend, API, auth, database, schema, and documentation changes. They were left intact. This pass changes only the Progress page, Admin Live Monitor page, and this checklist.
- This checklist reflects the current local source. Sai's PR #2 and any newer teammate branches were not fetched or verified.

## Local preview status

The previous `?demo=1` local preview has been removed because it skipped authentication for protected player and admin pages. `/hunt`, `/scan`, `/progress`, and `/admin/*` now require the corresponding signed session, including in local development. No sample preview currently replaces those pages.

## Pages requiring backend/auth integration

| Page / flow | Frontend readiness | Backend dependency / gap |
|---|---|---|
| Player login | Form submits, shows loading/error, stores returned player/team | Requires working `/api/auth/login`, signed cookie, and available password hash dependency. |
| Player registration | Fetches available teams; validates and submits registration, then expects player to log in | No email-verification page or OTP request was found. Team-list loading has visible error and retry states. |
| Hunt | Normal page loads team/current clue, polls state, displays timers and delayed hint state | Requires a valid player session bound to the team and working team, event, current-clue, and hint responses. |
| QR Scanner | Camera and manual token UI, processing lock and result feedback | Requires a valid player session, camera permissions/device, and `/api/scan`; live camera or scan flow was not exercised here. |
| Progress | Shows score/progress/history and polls routes | Requires team, clue and progress APIs. No leaderboard UI/API found; fetch failures have visible feedback and retry. |
| Admin login | Credential form and existing-session check | Requires `/api/auth/admin-login`, `/api/auth/me`, and a valid signed server session. |
| Real Admin Events, Clues, Teams, QR, Monitor | CRUD/monitoring UI exists | Requires signed admin session and the routes below. Current handlers use the Drizzle/PostgreSQL database layer. |
| Email verification | No page/flow found | No OTP/verification route found in the current scoped auth route set. |
| Player leaderboard | No page/flow found | No leaderboard route found. Admin monitor sorts/observes teams but is not a player leaderboard. |

## API contracts confirmed in the current source

Success shapes below are the handler's JSON output. Many failures use `{ success: false, message }`; validation and not-found status codes vary by route. Admin APIs are subject to `src/middleware.ts` session/role checks. This is static source inspection, not runtime proof.

| Frontend page/action | Method + path | Request sent | Handler response observed |
|---|---|---|---|
| Player login | `POST /api/auth/login` | JSON `{ username, password }` | `{ success:true, message, player, team }`; strips `password_hash` from returned objects and sets signed player cookie. |
| Registration team choices | `GET /api/teams/available` | None | `{ success:true, data:[{ id, team_name, current_members, max_players }] }`; may return empty data. |
| Player registration | `POST /api/auth/register` | `{ team_id, player_name, username, password }` | `{ success:true, message, data:{ id, player_name, username, team_name } }`; does not log in or verify email. |
| Login/session | `POST /api/auth/login`, `POST /api/auth/admin-login`; `GET /api/auth/me` | Login `{ username, password }`; session request relies on cookie | Player login returns `{ success:true, message, player, team }`; admin login returns `{ success:true, message, admin }`; both set signed cookies. `/me` returns the matching player/team pair or admin record based on signed session role. |
| Logout | `POST /api/auth/logout` | None | `{ success:true, message }`; clears session cookie. |
| Hunt team refresh | `GET /api/teams/[id]` | Team ID in path | `{ success:true, team }`; requires session and binds player to own `team_id` (admins may access any team). |
| Hunt clue load/refresh | `POST /api/hunt/current-clue` | `{ team_id }` | Incomplete: `{ success:true, isComplete:true, totalClues, score }`; active: `{ success:true, isComplete:false, clue:{ id, step_number, clue_text, has_hint, hint_text }, clueOrder:{ id, step_index, clue_started_at, hint_viewed, hint_viewed_at }, totalClues, currentStep, score, event }`. Handler requires a signed player session and matches `team_id` to the session. |
| Hunt hint reveal | `POST /api/hints/view` | `{ team_id, clue_id, player_id? }` | First reveal: `{ success:true, message, hint_text }`; repeated reveal: `{ success:true, message, already_viewed:true }` (no `hint_text`). Errors are `{ success:false, message }`. Handler requires a signed player session and binds the team to it. |
| QR scan submit | `POST /api/scan` | Scanner sends `{ token, team_id }`; handler also accepts optional `player_id` | Valid: `{ success:true, message, newScore, nextStep, isComplete, pointsEarned, hintUsed }`; decoy: `{ isFake:true, redirect_url, fake_label, message }`; errors `{ success:false, message }`. Handler requires a signed player session and binds the team to it. |
| Progress team/current clue/history | `GET /api/teams/[id]`; `POST /api/hunt/current-clue`; `GET /api/hunt/progress?team_id=...` | Team ID path; clue `{ team_id }`; progress query team ID | Progress `{ success:true, totalClues, scans:[{ id, scanned_at, clue_id, clue:{ location_name } }] }`. Each handler checks a signed session and enforces player team binding; admin reads are organization-scoped. |
| Admin Events | `GET/POST/PUT/DELETE /api/admin/events` | Create `{ name, start_time, end_time, hunt_duration_minutes, hint_delay_minutes }`; update `{ id, ...updates }`; delete `?id=` | GET/create return `{ success:true, data }`; update/delete `{ success:true }`. Start/stop are `POST /api/admin/events/start-hunt` and `/stop-hunt` with `{ event_id }`. |
| Admin Clues | `GET/POST/PUT/DELETE /api/admin/clues` | GET `?event_id=`; create `{ event_id, step_number, clue_text, location_name, hint_text, admin_notes }`; update `{ id, ...updates }`; delete `?id=` | GET/create `{ success:true, data }`; update/delete `{ success:true }`. UI reorder makes two separate PUT calls. |
| Admin Teams and scoring | `GET/POST/PUT/DELETE /api/admin/teams`; `POST /api/admin/teams/score` | GET `?event_id=`; create `{ event_id, team_name, min_players, max_players }`; update `{ id, ...updates }`; delete `?id=`; score `{ team_id, adjustment }` | Collection GET/create `{ success:true, data }`, update/delete `{ success:true }`; score `{ success:true, message, new_score }`. Current team UI uses the adjustment route. |
| Admin roster | `/api/admin/players`, `/api/admin/players/[id]`, `/move`, `/reset-password`, `/export` | GET `?team_id=` or `?event_id=`; DELETE player ID; PUT move `{ new_team_id }`; POST reset `{ player_id, new_password }`; export GET `?event_id=` | JSON handlers generally return `{ success:true, data }` or `{ success:true }`; export returns a downloadable CSV response. Handlers select explicit response fields and enforce admin/session and organization checks in source. |
| Admin QR | `/api/admin/qr/fake`, `/api/admin/qr/token`, `/api/admin/qr/generate` | Fake GET `?event_id=`; POST `{ event_id, label, redirect_url }`; DELETE `?id=`; token GET `?clue_id=`; generate POST `{ event_id }` | Fake list/create `{ success:true, data }`, delete `{ success:true }`; token `{ success:true, token, exists }`; generate ZIP JSON includes `zipBase64`, `clueCount`, `fakeCount`, `message`. Handlers use Drizzle/PostgreSQL and check admin session and organization scope in source. |
| Admin monitor | `GET /api/admin/events`, `/api/admin/clues?event_id=...`, `/api/admin/monitor?event_id=...`, `/api/admin/fake-qr-scans?event_id=...&limit=20` | Event/clue/monitor/fake-scan query parameters | Monitor `{ success:true, data:[{ team_id, team_name, score, current_step, is_disqualified, last_scan_at, clue_location }] }`; fake scans `{ success:true, data }`. UI polls monitor data every five seconds. |

## Confirmed gaps and mismatches

1. **High — live integration verification:** player gameplay handlers check the signed session and bind team IDs to it in source. These checks still need HTTP verification against a running non-production app/database; the targeted unit tests do not prove the live end-to-end flow.
2. **High — dependency state:** TypeScript remains blocked because `bcryptjs` is declared by `package.json` but missing from `package-lock.json` and installed modules. Password hashing/login cannot be validated until dependency files and install are reconciled.
3. **High — live integration verification:** the player and admin routes use the Drizzle/PostgreSQL layer in source, but complete database-backed integration remains unverified without HTTP tests against a safe local database.
4. **Medium — email verification absent:** frontend has no OTP/verification page or endpoint call. Add only after Owais confirms the endpoint and exact flow.
5. **Medium — leaderboard absent:** no player leaderboard page, endpoint, or contract exists. Do not mock a live leaderboard as if it were real.
6. **Medium — error handling:** registration team load, progress polling, and several admin initial loads/mutations log failures or can ignore non-2xx responses. These need visible retry/error handling before using with an unreliable backend.
7. **Medium — hint repeat shape:** `already_viewed` omits hint text. Hunt can recover it from refreshed clue data, but this response must remain accounted for if hint API integration changes.
8. **Unverified — runtime:** source contains scanner/camera, session, Neon and polling flows, but this audit did not test camera permissions, a live backend, a real session, or a complete hunt.

## Frontend improvements implemented in this pass

- **Progress (`src/app/progress/page.tsx`):** checks `response.ok` and `success` for team, current-clue, and progress calls; reports recoverable errors with a retry; points 401/403 users to sign in; displays a useful no-team state instead of returning blank; provides readable initial loading text; and prevents overlapping poll/retry requests.
- **Admin Live Monitor (`src/app/admin/monitor/page.tsx`):** shows failed event/team/clue/decoy-scan loads and mutations in an accessible alert, offers retry and admin sign-in actions for 401/403, shows the empty-events state, preserves the selected event during polling, checks mutation responses before refreshing, and disables team/event actions while those writes are pending. Existing five-second polling and API payloads remain unchanged.
- No leaderboard or verification UI was added: neither compatible API contract exists in the inspected checkout. The unsafe local `?demo=1` preview has been removed; protected pages require signed sessions.

### Files changed

- `src/app/progress/page.tsx`
- `src/app/admin/monitor/page.tsx`
- `FRONTEND_DEMO_CHECKLIST.md`

### Backend contract needed

- **Leaderboard:** Sai/Owais must confirm whether it is in scope and provide the actual route/method, event/team scoping, auth rules, success/error envelope, and fields for team identity/display name, rank, score, completed clue count, and total clue count. Also confirm refresh/poll expectations. No path or response shape is assumed here.
- **Email verification:** Owais must provide whether registration creates a pending account or sends verification after registration, the send/resend and verify operations, request fields and response/errors, expiration/rate limits, and whether login is blocked before verification. No OTP is collected or persisted by the current frontend.

## Prioritized Review 1 checklist

- [ ] Verify session binding for current-clue, hint view and scan with HTTP requests against a running non-production environment.
- [ ] Verify organization scoping for admin reads/writes and session role handling with non-production HTTP tests.
- [ ] Reconcile `bcryptjs` package manifest, lockfile and local installation; rerun TypeScript without suppressions.
- [ ] Confirm whether email verification is in scope; if yes, obtain the exact route and response contract before building a frontend flow.
- [ ] Confirm whether a leaderboard is in scope; if yes, obtain a real endpoint/contract rather than presenting sample rows as live.
- [ ] Verify the Neon-backed admin roster and QR flows with non-production HTTP tests.
- [ ] Run lint, typecheck, and source tests; then run HTTP contract tests against a non-production local server/database. Existing source tests pass but skip HTTP tests without `TEST_BASE_URL`.
- [ ] Manual smoke test with a seeded local event: login/register → start hunt → load clue → wait/reveal hint → scan valid, invalid and decoy QR → verify score/progress/monitor → logout and test session expiry.
- [ ] Verify camera permission and manual token entry on a physical mobile browser.

## Three most important next actions

1. Run the session-binding HTTP smoke tests for current-clue, hint view, and scan against a safe non-production environment.
2. Get confirmed leaderboard and email-verification contracts from the backend owners, then implement only the supported flows.
3. Reconcile `bcryptjs`, rerun TypeScript and HTTP authorization checks, then smoke-test a complete hunt and mobile camera against an isolated backend.

## Validation for this pass

- ESLint on `src/app/progress/page.tsx` and `src/app/admin/monitor/page.tsx`: passed with no diagnostics.
- `npm.cmd test`: 44 passed, 0 failed, 1 skipped. The skipped HTTP checks require `TEST_BASE_URL`; the rest are source/session tests, not end-to-end proof.
- `npm.cmd exec -- tsc --noEmit --incremental false`: still blocked only by `TS2307` for `bcryptjs` in `src/lib/auth/password.ts`. It is declared in `package.json` but missing from the lockfile and installed modules. No dependency files changed and no packages were installed.
- `git diff --check`: passed; Git printed existing LF-to-CRLF working-copy warnings.
- No browser, API server, camera, or real database verification was run. The new error and retry UI is source-verified only.
