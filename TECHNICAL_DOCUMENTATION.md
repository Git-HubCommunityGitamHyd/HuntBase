# HuntBase Platform - Technical Architecture & Documentation

> **Last Updated:** October 2026  
> **Version:** 3.0 (Multi-Tenant HuntBase Architecture by @AllikaSaiHarsha)

---

## 📋 Table of Contents

1. [Architectural Overview](#architectural-overview)
2. [Tech Stack](#tech-stack)
3. [Multi-Tenant Data Architecture](#multi-tenant-data-architecture)
4. [Security & Anti-Cheat System](#security--anti-cheat-system)
5. [Scanner Engine & Camera Lifecycle](#scanner-engine--camera-lifecycle)
6. [Polling & Monitoring](#polling--monitoring)
7. [Storage & Custom Branding Assets](#storage--custom-branding-assets)
8. [Setup & Migration Guide](#setup--migration-guide)

---

## 1. Architectural Overview

HuntBase is an event SaaS platform enabling campus clubs to run self-contained treasure hunts with customized branding, randomized clue orders, anti-cheat QR validation, and admin monitoring refreshed every five seconds.

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js 16 App                         │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │    Participant UI     │       │     Host Admin UI     │  │
│  │  (/hunt, /scan, etc)  │       │  (/admin/events, etc) │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
└──────────────┼───────────────────────────────┼──────────────┘
               │                               │
       Public Routes                   Protected by Middleware
 (Secure Stripped Clue API)           (HttpOnly Session Cookies)
               │                               │
┌──────────────┴───────────────────────────────┴──────────────┐
│                      Neon Infrastructure                    │
│                                                             │
│   PostgreSQL database    Organization assets stored as bytea
│   Drizzle SQL migrations  Polling API for live updates      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

- **Framework:** Next.js 16.1.1 (App Router, Turbopack)
- **Runtime:** Node.js 20+
- **Database:** Neon PostgreSQL accessed through Drizzle ORM
- **State & Context:** React 19 Contexts (`AuthContext`, `ThemeContext`)
- **Styling:** Tailwind CSS v4 & shadcn/ui with CSS Variable Design Tokens
- **Live Updates:** API polling every five seconds in player and admin dashboards
- **QR Engine:** `html5-qrcode` & `qrcode` server utilities

---

## 3. Multi-Tenant Data Architecture

The database is defined in `src/db/schema` and applied through ordered SQL migrations in `migrations/`. The current schema has 16 public tables:

| Area | Tables |
|---|---|
| Organization | `organizations`, `host_users`, `theme_configs`, `password_reset_tokens`, `organization_assets` |
| Event | `events`, `event_pauses` |
| Team and identity | `teams`, `team_members`, `sessions`, `email_verifications` |
| Hunt | `clues`, `qr_codes`, `team_clue_order` |
| Gameplay records | `scans`, `fake_qr_scans` |

### Tenant and gameplay relationships

- An organization owns events, teams, theme configuration, and uploaded assets. `host_users.organization_id` is nullable for a platform super-admin; tenant admins use role `club_admin`.
- Each event belongs to an organization. Teams belong to both an event and an organization. Player accounts belong to a team; player credentials are not stored on the team row.
- Clues and QR codes belong to an event. A real QR references a clue; a decoy QR has no clue reference. `team_clue_order` assigns each team a clue sequence.
- Sessions reference exactly one host user or player account. Email verification rows belong to player accounts.
- Valid scans reference organization, event, team, clue, and QR; one team can score a given clue only once. Decoy scans are stored separately.

### Foreign-key deletion behavior

- Deleting an organization cascades to its theme configuration and assets. Organization deletion is restricted while host users, events, or teams still reference it.
- Deleting an event cascades to its clues, QR codes, scans, and decoy scans; deletion is restricted while teams or pause records reference it.
- Deleting a team cascades to its members, clue order, scans, and decoy scans. Deleting a player cascades to sessions, email verifications, and decoy scans; audit references from valid scans and hint records are set to null.
- Deleting a clue cascades to QR codes, clue-order rows, and scan rows. Deleting a QR cascades to its scan records.
- Deleting a host user cascades to its sessions and password-reset tokens.

The schema source is authoritative for exact constraints and indexes; update this section whenever those definitions change.

---

## 4. Security & Anti-Cheat System

### A. Zero DevTools Data Leaks
- Clue data is served through `POST /api/hunt/current-clue`.
- Sensitive fields (`admin_notes`, `location_name`) are stripped at the server edge before transmission.
- `hint_text` is omitted until the team explicitly claims the hint with a point penalty.

### B. Server-side data access
- The application accesses Neon through server-side API routes and Drizzle; Supabase RLS policies are not part of this database setup.
- Player clue responses are filtered by the server. Scan handling derives player and team identity from the verified HttpOnly session, not request-body IDs.

### C. Session Guards
- `src/proxy.ts` protects admin page routes. API authorization is enforced in the relevant server handlers using the `huntbase_session` HttpOnly cookie and database-backed session rows.
- Passwords use salted scrypt hashes. Legacy unsalted SHA-256 hashes are upgraded after a successful login.

---

## 5. Scanner Engine & Camera Lifecycle

- **Mobile Camera Auto-Scan:** When users scan a physical QR code with their native iOS/Android camera, the URL carries `?token=...`. The scanner page automatically intercepts and verifies the token without forcing a manual re-scan.
- **Hardware Resource Release:** `html5-qrcode` scanner instances are monitored via `isScanning` flags and released in `useEffect` cleanup routines to prevent sensor lock on iOS Safari.
- **Haptic Feedback:** Triggers `navigator.vibrate([100, 50, 100])` upon verified scans.

---

## 6. Polling & Monitoring

- The hunt, progress, and admin monitoring pages poll Neon-backed API endpoints every five seconds; the application does not use WebSockets for these updates.

---

## 7. Storage & Custom Branding Assets

- **Storage:** `organization_assets` PostgreSQL table (`bytea`)
- **Access:** Public asset endpoint at `/api/assets/{id}`
- **Limit:** 5 MB per file
- **MIME Types:** `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp`
- **Uploader Endpoint:** `POST /api/admin/upload-asset`

---

## 8. Setup & Migration Guide

```bash
# 1. Clone repository
git clone https://github.com/Git-HubCommunityGitamHyd/HuntBase.git
cd HuntBase

# 2. Install dependencies
npm install

# 3. Synchronize database schema
npm run db:migrate

# 4. Seed the initial super admin
npm run db:seed

# 5. Start local development server
npm run dev
```

---

*GitHub Community GITAM - HuntBase Engineering Team*
