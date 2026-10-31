# HuntBase Rebuild Plan & Comprehensive Architectural Blueprint

**Project:** HuntBase — Multi-Tenant Campus Treasure Hunt Platform  
**Target Database:** Neon PostgreSQL (Confirmed)  
**Date:** 2026-10-29  
**Status:** Audit & Architecture Plan (Pre-Implementation)

---

## 1. Executive Summary & Architecture Shift

HuntBase is undergoing a major architecture modernization. **Supabase is deprecated legacy code and must not be used in the new architecture.** All persistence, data modeling, multi-tenant organization isolation, and transaction handling will be powered directly by **Neon PostgreSQL**, accessed via secure server-side API routes and an ORM/query builder (e.g., Drizzle ORM or `pg` with connection pooling) rather than client-side SDKs or Supabase client helpers.

This plan integrates the insights from our repository audit and `FRONTEND_REUSE_REPORT.md`, defining clear separation of concerns across our three workstreams while preserving functional UI components and core gameplay workflows.

---

## 2. Reusable Assets vs. Legacy Code to Replace

### ✅ What We Are Reusing (Preserve & Adapt)
1. **Frontend UI Components & Layouts**: shadcn/ui primitives, mobile-first participant pages (`/hunt`, `/scan`, `/progress`, `/login`, `/register`), and club admin dashboards (`/admin/*`).
2. **Camera Scanner Lifecycle**: Robust `html5-qrcode` integration with mobile lifecycle cleanup (`isScanning`, `stopScanner`), URL token auto-parsing (`?token=...`), and haptic feedback (`src/app/scan/page.tsx`).
3. **Core Gameplay Logic & Flow**: 
   - Round-robin starting offsets (`team_clue_order`) to prevent physical crowding.
   - Timed hint economy (configurable delay, point penalty tracking).
   - Secure server-side clue sanitization (`/api/hunt/current-clue`) which strips `admin_notes` and `location_name` to prevent DevTools data leaks.
4. **Authentication & Session Foundation**: HMAC-SHA256 signed HttpOnly cookies (`huntbase_session`) with strict runtime validation (`validateSessionUser`) and middleware RBAC (`src/middleware.ts`).

### 🔄 What We Are Replacing (Legacy Supabase / Insecure Patterns)
1. **Database Client & Connection**: Replace `@supabase/supabase-js` and `@supabase/ssr` with Neon PostgreSQL connection pooling (`pg` or Drizzle ORM).
2. **Database Schema & RLS**: Migrate Supabase SQL schema definitions to standard PostgreSQL (Neon-compatible), replacing Supabase-specific auth hooks with standard application-level or PostgreSQL RLS policies scoped by `organization_id`.
3. **Realtime Architecture**: Replace Supabase Realtime WebSocket channels with standard PostgreSQL LISTEN/NOTIFY, Server-Sent Events (SSE), or optimized polling for the admin monitor (`/admin/monitor`).
4. **Transaction Handling**: Replace Supabase RPC functions with standard PostgreSQL ACID transactions (`BEGIN ... COMMIT`) for atomic scan verification and score updates.
5. **Credential Security**: Upgrade password hashing from client/simple SHA-256 to `bcrypt` or `Argon2id`.

---

## 3. Corrected Architecture & Workstream Recommendations (Neon PostgreSQL)

### Workstream 1: Frontend & Application Integration
* **Responsibility**: Participant experience, camera scanner, leaderboards, admin management dashboards, and theme customizer.
* **Key Tasks**:
  - Maintain fluid mobile UX and camera handling.
  - Decouple all frontend components from direct Supabase client calls; ensure all data fetching flows strictly through Next.js API routes (`/api/*`).
  - Finalize the theme engine (`ThemeContext` + `src/app/admin/theme/page.tsx`) for dynamic CSS variable injection.
  - Implement robust loading, empty, and error states aligned with backend API error responses.

### Workstream 2: Gameplay Backend & Event Management
* **Responsibility**: Hunt lifecycle (start/stop), round-robin clue distribution, hint timers, QR generation, scoring, and telemetry.
* **Key Tasks**:
  - Implement robust API route handlers for hunt events, clue management, and team progression.
  - Build atomic scan verification logic using Neon PostgreSQL transaction blocks to prevent race conditions on score increments.
  - Optimize admin monitoring endpoints to batch scan queries and avoid N+1 overhead.

### Workstream 3: Database, Authentication, Authorization & Security
* **Responsibility**: Neon PostgreSQL schema design, connection pooling, HMAC-SHA256 session cookies, RBAC middleware, password hashing upgrade, and security test suites.
* **Key Tasks**:
  - Author the master Neon PostgreSQL schema with proper foreign keys, cascading deletes, indexes, and standard PostgreSQL RLS.
  - Implement secure password hashing (`bcrypt`/`Argon2`).
  - Enforce tenant isolation (`organization_id`) across all database queries and API endpoints.
  - Maintain and expand unit/integration test suites (`scripts/test-access-control.ts`, `scripts/test-session-security.ts`).

---

## 4. Top 5 Priority Tasks

1. **Migrate Database Schema to Neon PostgreSQL**: Translate the 12-table master schema to a Neon-compatible PostgreSQL schema script with standard indexing, foreign keys, and RLS.
2. **Upgrade Password Hashing**: Implement robust hashing (`bcrypt` or `argon2id`) in backend auth helpers.
3. **Implement Atomic Scan Transactions**: Wrap scan validation, clue progression, and score updates in PostgreSQL transaction blocks.
4. **Decouple Frontend from Supabase**: Audit all API routes and UI components to ensure zero direct client-side database queries, routing all traffic through secured Next.js endpoints backed by Neon.
5. **Rate Limiting & Security Hardening**: Add rate limiting middleware to authentication, registration, and QR scan endpoints.

---

## 5. Practical Implementation Sequence (Next 2 Days)

- **Day 1 (Schema, Auth & Database Integration):**
  - Finalize Neon PostgreSQL schema definitions and connection configuration.
  - Upgrade password hashing and establish secure session/auth handlers.
  - Refactor backend API routes to connect to Neon PostgreSQL with connection pooling.
  - Fix existing unit test assertions to ensure 100% pass rate.

- **Day 2 (Gameplay, UI Polish & Verification):**
  - Connect frontend participants and admin dashboards to the new Neon-backed APIs.
  - Verify mobile camera scanner behavior, hint timers, and round-robin clue distribution.
  - Perform multi-tenant organization isolation checks and security reviews.

---

## 6. Key Decisions Required Before Finalizing API Contracts & Schema

1. **ORM / Query Builder**: Choose between **Drizzle ORM** (type-safe, lightweight SQL-like syntax) vs. native `pg` client with parameterized SQL queries.
2. **Realtime Updates Strategy**: Decide between optimized polling (e.g., every 5-10s for admin monitor) vs. Server-Sent Events (SSE) for real-time leaderboards.
3. **Atomic Scan Concurrency**: Confirm PostgreSQL transaction isolation levels (e.g., `READ COMMITTED` with row locks) for concurrent QR code scans.
4. **Password Hashing Library**: Select between `bcryptjs` (pure JS, zero native build overhead) and `@node-rs/argon2` (high performance native).
