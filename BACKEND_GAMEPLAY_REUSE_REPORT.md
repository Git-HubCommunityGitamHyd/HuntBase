# HuntBase Rebuild — Backend & Gameplay Engineering Reuse Report

**Workstream:** Backend & Gameplay Engineering  
**Reference Foundation:** TECHSPADES (current HuntBase implementation)  
**Date:** 2026-10-29  
**Branch:** staging-build-v1  

---

## Executive Summary

The current HuntBase implementation (`staging-build-v1`) provides a **substantial, production-ready foundation** for the treasure-hunt lifecycle. Approximately **70-80% of backend gameplay logic is reusable** with targeted adaptations. The architecture correctly implements multi-tenant isolation, anti-cheat QR validation, round-robin clue distribution, timed hint economy, and real-time monitoring. Key areas requiring adaptation: password hashing (upgrade from SHA-256 to bcrypt/argon2), scan endpoint transaction safety, and admin API authorization consistency.

---

## 1. Complete Treasure-Hunt Lifecycle — Reuse Assessment

### 1.1 Hunt Creation & Configuration (`/api/admin/events/route.ts`)

| Aspect | Current Implementation | Reuse Verdict | Notes |
|--------|----------------------|---------------|-------|
| Event CRUD | Full GET/POST/PUT/DELETE with validation | ✅ **Reuse** | Clean REST patterns, proper error handling |
| Hunt lifecycle fields | `hunt_status`, `hunt_started_at`, `hunt_ended_at`, `hunt_duration_minutes`, `hint_delay_minutes` | ✅ **Reuse** | All fields present in schema and API |
| Event activation gate | `is_active` boolean + `hunt_started_at` timestamp | ✅ **Reuse** | Dual-gate prevents premature starts |
| Capacity constraints | `default_min_players`, `default_max_players` | ✅ **Reuse** | Per-event overrides supported |

**File:** `src/app/api/admin/events/route.ts:24-140`

### 1.2 Hunt Start — Round-Robin Clue Distribution (`/api/admin/events/start-hunt/route.ts`)

| Aspect | Current Implementation | Reuse Verdict | Notes |
|--------|----------------------|---------------|-------|
| Round-robin starting offsets | `startOffset = teamIndex % clues.length` | ✅ **Reuse** | Core anti-crowding mechanic, correctly implemented |
| First clue fixed, rest shuffled | `shuffleArray(rotatedClues.slice(1))` | ✅ **Reuse** | Preserves round-robin start, randomizes rest |
| `team_clue_order` population | Bulk insert with `step_index` | ✅ **Reuse** | Correct unique constraints enforced |
| Team reset on start | `current_step: 0, score: 0, hunt_finished_at: null` | ✅ **Reuse** | Clean restart semantics |
| `hunt_started_at` timestamp | Set to `new Date().toISOString()` | ✅ **Reuse** | Authoritative hunt clock source |

**File:** `src/app/api/admin/events/start-hunt/route.ts:14-176`

### 1.3 Hunt Stop (`/api/admin/events/stop-hunt/route.ts`)

| Aspect | Current Implementation | Reuse Verdict | Notes |
|--------|----------------------|---------------|-------|
| Stop mechanism | Clears `hunt_started_at` to null | ✅ **Reuse** | Simple, effective pause/resume capability |

**File:** `src/app/api/admin/events/stop-hunt/route.ts:1-43`

### 1.4 Clue Progression & Current Clue Fetch (`/api/hunt/current-clue/route.ts`)

| Aspect | Current Implementation | Reuse Verdict | Notes |
|--------|----------------------|---------------|-------|
| Server-side clue delivery | `/api/hunt/current-clue` POST endpoint | ✅ **Reuse** | **Critical anti-cheat**: strips `admin_notes`, `location_name`, gates `hint_text` |
| `clue_started_at` initialization | Auto-sets on first fetch if null | ✅ **Reuse** | Enables hint delay timer |
| Sanitization logic | Returns `has_hint` boolean, `hint_text` only if `hint_viewed=true` | ✅ **Reuse** | Zero DevTools leakage |
| Completion detection | `current_step >= totalClues` | ✅ **Reuse** | Correct boundary logic |

**File:** `src/app/api/hunt/current-clue/route.ts:1-142`

### 1.5 QR Code Scanning & Validation (`/api/scan/route.ts`)

| Aspect | Current Implementation | Reuse Verdict | Adaptation Needed |
|--------|----------------------|---------------|-------------------|
| Token lookup | `qr_codes` by `qr_token` + `event_id` | ✅ **Reuse** | |
| Fake/decoy QR handling | `is_fake` flag, logs to `fake_qr_scans`, returns redirect | ✅ **Reuse** | Hall of Shame feature works |
| Expected clue verification | Cross-references `team_clue_order.step_index == team.current_step` | ✅ **Reuse** | Enforces round-robin order |
| Duplicate scan prevention | `UNIQUE(team_id, clue_id)` on `scans` table + explicit check | ✅ **Reuse** | Database + application layer |
| Scoring logic | 10 pts no hint, 5 pts with hint (`hint_was_used`) | ✅ **Reuse** | Correctly reads `team_clue_order.hint_viewed` |
| Team progress update | Increments `current_step`, updates `score`, sets `hunt_finished_at` on completion | ⚠️ **Adapt** | **Race condition risk**: non-atomic read-modify-write. Use DB transaction or RPC. |
| Hunt timer enforcement | Checks `hunt_started_at + hunt_duration_minutes` vs `now` | ✅ **Reuse** | |
| Event window enforcement | Checks `start_time` / `end_time` | ✅ **Reuse** | |

**File:** `src/app/api/scan/route.ts:1-253`

### 1.6 Hint System (`/api/hints/view/route.ts`, `/api/hints/start-clue/route.ts`)

| Aspect | Current Implementation | Reuse Verdict | Notes |
|--------|----------------------|---------------|-------|
| Hint delay enforcement | `hint_delay_minutes` from event, compares against `clue_started_at` | ✅ **Reuse** | Configurable per event |
| Hint penalty tracking | Sets `hint_viewed=true`, `hint_viewed_at`, `hint_viewed_by` on `team_clue_order` | ✅ **Reuse** | Auditable |
| Score impact | Scan endpoint reads `hint_viewed` to apply 5 vs 10 pts | ✅ **Reuse** | Consistent |
| Hint text delivery | Only returned after successful `view` call | ✅ **Reuse** | No premature leakage |

**Files:** `src/app/api/hints/view/route.ts:1-122`, `src/app/api/hints/start-clue/route.ts:1-72`

### 1.7 Team & Player Management

| Aspect | Current Implementation | Reuse Verdict | Notes |
|--------|----------------------|---------------|-------|
| Team creation (manual) | `/api/admin/teams/route.ts` POST | ✅ **Reuse** | Supports min/max players |
| Bulk team generation | `/api/admin/teams/generate/route.ts` with credentials | ✅ **Reuse** | Generates usernames/passwords, creates `team_clue_order` |
| Player login | `/api/auth/login/route.ts` via `team_members` | ✅ **Reuse** | Returns session cookie + team context |
| Team refresh endpoint | `/api/teams/[id]/route.ts` with IDOR protection | ✅ **Reuse** | Players only access own team |
| Progress endpoint | `/api/hunt/progress/route.ts` returns scans + locations only | ✅ **Reuse** | Sanitized, no clue text/answers |

---

## 2. QR Generation & Scanning — Reuse Assessment

### 2.1 QR Generation (`/api/admin/qr/generate/route.ts`)

| Feature | Implementation | Reuse Verdict |
|---------|---------------|---------------|
| Server-side PNG generation | `qrcode` library, 400px, custom colors | ✅ **Reuse** |
| Batch ZIP export | `JSZip` with organized filenames | ✅ **Reuse** |
| Fake QR generation | Red-colored, separate folder in ZIP | ✅ **Reuse** |
| Token persistence | Upserts to `qr_codes` table (reuses existing tokens) | ✅ **Reuse** |
| Scan URL format | `${appUrl}/scan?token=${qrToken}` | ✅ **Reuse** |

**File:** `src/app/api/admin/qr/generate/route.ts:1-142`

### 2.2 Client-Side Scanner (`src/app/scan/page.tsx`)

| Feature | Implementation | Reuse Verdict | Notes |
|---------|---------------|---------------|-------|
| `html5-qrcode` integration | Environment-facing camera, configurable QR box | ✅ **Reuse** | |
| Native camera auto-scan | Parses `?token=` from URL, auto-processes | ✅ **Reuse** | Critical for iOS/Android native camera flow |
| Camera lifecycle management | `isScanning` guard, `stopScanner()` cleanup in `useEffect` | ✅ **Reuse** | Fixes iOS Safari sensor lock |
| Haptic feedback | `navigator.vibrate([80,40,80])` on scan | ✅ **Reuse** | |
| Debounce/replay protection | `lastScannedRef` 3-second cooldown | ✅ **Reuse** | |
| Manual code entry fallback | Text input for damaged QRs | ✅ **Reuse** | |
| Fake QR redirect handling | Auto-navigates to `redirect_url` after 1.5s | ✅ **Reuse** | |

**File:** `src/app/scan/page.tsx:1-388`

---

## 3. Scoring, Hints, Teams, Timers — Reuse Assessment

### 3.1 Scoring System
- **Values:** 10 pts (no hint), 5 pts (hint used) — **Reuse**
- **Storage:** `teams.score` + `scans.hint_was_used` — **Reuse**
- **Leaderboard:** Real-time via Supabase Realtime on `teams` (with RLS) — **Adapt**: `teams` removed from realtime for security; monitor uses polling + scans realtime

### 3.2 Hint Economy
- **Delay:** Configurable per event (`hint_delay_minutes`, default 5) — **Reuse**
- **Penforcement:** Point deduction at scan time, not hint view time — **Reuse** (prevents hint-view-then-scan-quickly gaming)
- **Visibility:** `hint_text` only after explicit `/api/hints/view` call — **Reuse**

### 3.3 Team Management
- **Credentials:** Per-player accounts in `team_members` (username/password_hash) — **Reuse**
- **Legacy admin fallback:** `teams.is_admin` + `teams.username/password_hash` — **Deprecate** (migrate fully to `host_users`)

### 3.4 Synchronized Timer
- **Source of truth:** `events.hunt_started_at` + `hunt_duration_minutes` — **Reuse**
- **Client countdown:** `useEffect` polling every 1s — **Reuse**
- **Server enforcement:** Scan endpoint validates `now <= huntEndTime` — **Reuse**

---

## 4. Admin Monitoring — Reuse Assessment

### 4.1 Monitor API (`/api/admin/monitor/route.ts`)

| Feature | Implementation | Reuse Verdict |
|---------|---------------|---------------|
| Bulk scan fetch | Single query with `.in('team_id', teamIds)` — avoids N+1 | ✅ **Reuse** |
| Latest scan per team | Map reduction in memory | ✅ **Reuse** |
| Defense-in-depth auth | `getSession()` before `createAdminClient()`, explicit role check | ✅ **Reuse** |
| Room-filtered realtime | Frontend subscribes with `filter: \`event_id=eq.${selectedEvent}\`` | ✅ **Reuse** |

**File:** `src/app/api/admin/monitor/route.ts:1-120`

### 4.2 Monitor Frontend (`src/app/admin/monitor/page.tsx`)

- Real-time WebSocket subscriptions to `events`, `scans`, `fake_qr_scans`
- Team polling every 10s as fallback (since `teams` table not in realtime)
- **Reuse with adaptation**: Ensure WebSocket channels properly filter by `event_id`

---

## 5. Existing Tests — Inventory

| Test File | Scope | Status |
|-----------|-------|--------|
| `scripts/test-access-control.ts` | Session auth, middleware RBAC, IDOR protection, secret omission, schema hardening | ✅ Comprehensive unit tests (Node.js `test` runner) |
| `scripts/test-session-security.ts` | Cryptographic signing, tampering, expiration, payload validation, missing secret | ✅ Comprehensive unit tests |
| `scripts/test-database-suite.js` | (Referenced in PENDING.md) 16/16 tests: tables, cascades, constraints, realtime | ⚠️ **Verify exists** — not in current file list |
| `scripts/migrate.js` | One-click schema execution helper | ✅ Present |

**Gap:** No end-to-end integration tests (Playwright/Cypress) for full hunt flow. No load tests for concurrent scans.

---

## 6. Security Concerns — Findings

| # | Concern | Location | Severity | Recommendation |
|---|---------|----------|----------|----------------|
| 1 | **SHA-256 password hashing** (no salt, no work factor) | `src/lib/utils/helpers.ts:68-80` | **HIGH** | Migrate to bcrypt (cost 12+) or Argon2id. Use `bcryptjs` or `@node-rs/argon2`. |
| 2 | **Scan endpoint race condition** | `src/app/api/scan/route.ts:176-231` | **HIGH** | Wrap scan insert + team update in Supabase RPC (PostgreSQL function) or use `pg_advisory_xact_lock`. |
| 3 | **Legacy admin credentials in `teams` table** | `supabase/schema.sql:133-136`, `src/app/api/auth/admin-login/route.ts:78-117` | **MEDIUM** | Deprecate `teams.username/password_hash/is_admin`. Migrate all admins to `host_users`. |
| 4 | **No rate limiting on auth/scan endpoints** | All auth & scan routes | **MEDIUM** | Add middleware rate limiting (e.g., `@vercel/rate-limiter` or custom Redis-based). |
| 5 | **SESSION_SECRET not validated at startup** | `src/lib/auth/session.ts:86-89` | **LOW** | Add build-time / startup check; fail fast if missing. |
| 6 | **`html5-qrcode` camera permissions UX** | `src/app/scan/page.tsx:200-205` | **LOW** | Improve permission-denied recovery flow. |
| 7 | **Admin API inconsistent org-scoping** | Some admin routes don't verify `organization_id` matches session | **MEDIUM** | Add org-scoping checks to all `/api/admin/*` handlers. |

---

## 7. File Inventory — Backend Gameplay Logic

### Core Gameplay API Routes (Reusable)

| File | Purpose | Reuse |
|------|---------|-------|
| `src/app/api/scan/route.ts` | QR validation, scoring, progression | ✅ (with transaction fix) |
| `src/app/api/hunt/current-clue/route.ts` | Secure clue delivery, sanitization | ✅ |
| `src/app/api/hunt/progress/route.ts` | Team progress + scan history | ✅ |
| `src/app/api/hints/view/route.ts` | Hint unlock with delay + penalty | ✅ |
| `src/app/api/hints/start-clue/route.ts` | Clue timer initialization | ✅ |
| `src/app/api/admin/events/route.ts` | Event CRUD | ✅ |
| `src/app/api/admin/events/start-hunt/route.ts` | Round-robin clue order generation | ✅ |
| `src/app/api/admin/events/stop-hunt/route.ts` | Hunt pause/stop | ✅ |
| `src/app/api/admin/qr/generate/route.ts` | Batch QR + ZIP generation | ✅ |
| `src/app/api/admin/qr/fake/route.ts` | Fake QR management | ✅ |
| `src/app/api/admin/teams/route.ts` | Team CRUD | ✅ |
| `src/app/api/admin/teams/generate/route.ts` | Bulk team + credential generation | ✅ |
| `src/app/api/admin/teams/score/route.ts` | Manual score adjustment | ✅ |
| `src/app/api/admin/monitor/route.ts` | Real-time dashboard data | ✅ |
| `src/app/api/admin/fake-qr-scans/route.ts` | Hall of Shame data | ✅ |

### Authentication & Session

| File | Purpose | Reuse |
|------|---------|-------|
| `src/lib/auth/session.ts` | HMAC-SHA256 signed cookies, strict validation | ✅ (upgrade hash for passwords only) |
| `src/middleware.ts` | Route protection, role gates, header injection | ✅ |
| `src/app/api/auth/login/route.ts` | Player login (team_members) | ✅ |
| `src/app/api/auth/admin-login/route.ts` | Admin login (host_users + legacy fallback) | ⚠️ (drop legacy) |
| `src/app/api/auth/logout/route.ts` | Session clearing | ✅ |
| `src/app/api/auth/me/route.ts` | Current session info | ✅ |

### Database & Utilities

| File | Purpose | Reuse |
|------|---------|-------|
| `supabase/schema.sql` | Master schema (12 tables, RLS, realtime, storage) | ✅ |
| `src/lib/supabase/server.ts` | Admin (service role) + anon clients | ✅ |
| `src/lib/supabase/client.ts` | Browser client with realtime config | ✅ |
| `src/lib/utils/helpers.ts` | Password hashing, QR tokens, username gen, shuffle | ⚠️ (upgrade hash) |

---

## 8. Recommendations — What to Reuse, Adapt, Rebuild

### ✅ REUSE AS-IS (High Confidence)

1. **Complete hunt lifecycle APIs** — Event CRUD, start/stop, round-robin distribution
2. **Secure clue delivery** — `/api/hunt/current-clue` sanitization pattern
3. **QR generation & scanning** — Batch ZIP, native camera auto-scan, fake QR handling
4. **Hint economy** — Delay enforcement, penalty tracking, gated delivery
5. **Admin monitoring** — Bulk scan fetch, realtime subscriptions, defense-in-depth auth
6. **Session architecture** — HMAC-signed HttpOnly cookies, middleware guards, role validation
7. **Database schema** — Multi-tenant tables, RLS policies, realtime config, indexes
8. **Access control tests** — Comprehensive unit test suite for auth/authorization

### ⚠️ ADAPT (Targeted Changes Required)

| Component | Change Required | Effort |
|-----------|-----------------|--------|
| Password hashing | Replace SHA-256 with bcrypt/Argon2 in `helpers.ts` + migrate existing hashes | Medium |
| Scan endpoint | Wrap scan insert + team update in PostgreSQL RPC function (atomic) | Medium |
| Legacy admin cleanup | Remove `teams.username/password_hash/is_admin` columns + fallback logic | Low |
| Rate limiting | Add to middleware or per-route for auth/scan endpoints | Low |
| Org-scoping on admin APIs | Verify `session.organization_id` matches resource `organization_id` | Low |
| Realtime strategy | Document polling + scans/events realtime as intentional (teams excluded) | Docs only |

### 🔄 REBUILD / NEW (Not in Current Codebase)

1. **End-to-end integration tests** — Playwright flow: login → hunt start → scan sequence → hint → completion → leaderboard
2. **Load testing** — Concurrent scan simulation (100+ teams)
3. **Admin audit log** — Track admin actions (event start/stop, team edits, QR regen)
4. **Webhook/export system** — Results export, webhook on hunt completion
5. **Multi-event concurrent support** — Verify isolation when multiple events active per org
6. **Player-facing realtime** — Optional: live clue unlock notifications via `team_clue_order` realtime

---

## 9. Shared Decisions Needed (Cross-Workstream)

| Decision | Backend Impact | Database/Auth Impact |
|----------|----------------|----------------------|
| **Password hash migration strategy** | Update `helpers.ts`, re-hash on next login | Add `password_hash_alg` column or version prefix |
| **Scan atomicity: RPC vs. advisory lock** | New PostgreSQL function needed | Add function to `schema.sql` |
| **Legacy admin removal timeline** | Drop fallback in `admin-login/route.ts` | Drop columns from `teams` table |
| **Rate limiting storage** | In-memory (dev) vs Redis (prod) | N/A |
| **Realtime vs polling for player UI** | Current: polling for team state | Keep `teams` out of realtime (security) |

---

## 10. Evidence Appendix — Key Source References

| Feature | File | Lines |
|---------|------|-------|
| Round-robin clue order | `src/app/api/admin/events/start-hunt/route.ts` | 94-128 |
| Scan validation & scoring | `src/app/api/scan/route.ts` | 100-245 |
| Clue sanitization | `src/app/api/hunt/current-clue/route.ts` | 108-117 |
| Hint delay enforcement | `src/app/api/hints/view/route.ts` | 72-84 |
| Session encode/decode | `src/lib/auth/session.ts` | 85-158 |
| Middleware RBAC | `src/middleware.ts` | 18-58 |
| Schema RLS policies | `supabase/schema.sql` | 240-328 |
| Access control tests | `scripts/test-access-control.ts` | 1-356 |
| Session security tests | `scripts/test-session-security.ts` | 1-221 |

---

## Conclusion

The TECHSPADES / HuntBase codebase provides a **strong, well-architected foundation** for the rebuild. The multi-tenant schema, anti-cheat QR validation, round-robin clue distribution, hint economy, and real-time monitoring are all correctly implemented and production-ready. 

**Primary engineering investment** should focus on:
1. **Password hashing upgrade** (security critical)
2. **Scan endpoint atomicity** (correctness critical)
3. **Legacy admin credential removal** (architectural hygiene)
4. **Rate limiting & org-scoping** (defense in depth)

All other gameplay systems can be **reused directly** with confidence. The existing test suite (`test-access-control.ts`, `test-session-security.ts`) provides excellent regression coverage for auth/authorization logic.

---

**Prepared by:** Backend & Gameplay Engineering Workstream  
**Next Step:** Combine with Database & Security Design Report → Joint Architecture Review → Implementation Sprint