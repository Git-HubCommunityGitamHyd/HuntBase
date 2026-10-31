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
6. [Real-time WebSockets & Monitoring](#real-time-websockets--monitoring)
7. [Storage & Custom Branding Assets](#storage--custom-branding-assets)
8. [Setup & Migration Guide](#setup--migration-guide)

---

## 1. Architectural Overview

HuntBase is an event SaaS platform enabling campus clubs to run concurrent, self-contained treasure hunts with customized branding, randomized clue orders, anti-cheat QR validation, and sub-300ms live admin monitoring.

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

The database is defined in `src/db/schema` and applied through the SQL migrations in `migrations/`.

### Core Tables (12 Public Tables)

1. **`organizations`**: SaaS tenant representing the hosting student club (slug, name, logo, verified).
2. **`host_users`**: Club organizers with roles (`super_admin`, `host`), scoped to an organization.
3. **`theme_configs`**: Club visual tokens (primary, accent, background colors, custom CSS classes).
4. **`password_reset_tokens`**: Time-limited recovery tokens.
5. **`events`**: Scheduled hunt events scoped to an organization.
6. **`teams`**: Participating groups with credentials, current clue pointers, and score totals.
7. **`team_members`**: Roster of students per team.
8. **`clues`**: Riddles and location points with secret coordinates and answers.
9. **`qr_codes`**: Unique cryptographic tokens associated with clues or decoy fake traps.
10. **`team_clue_order`**: Round-robin starting point sequences per team preventing physical crowding.
11. **`scans`**: Checkpoint validation logs enforcing `UNIQUE(team_id, clue_id)`.
12. **`fake_qr_scans`**: Decoy scans feeding the live Hall of Shame.

---

## 4. Security & Anti-Cheat System

### A. Zero DevTools Data Leaks
- Clue data is served exclusively through `GET /api/hunt/current-clue`.
- Sensitive fields (`admin_notes`, `location_name`) are stripped at the server edge before transmission.
- `hint_text` is omitted until the team explicitly claims the hint with a point penalty.

### B. Row Level Security (RLS) Lockdown
- Tables containing secrets (`clues`, `qr_codes`, `host_users`) strictly block direct `anon` SELECT queries.
- Public directory tables (`organizations`, `theme_configs`) permit read-only queries for unauthenticated club selection.

### C. Session Guards
- Club admin paths are guarded at the network edge via `src/middleware.ts`.
- Validates the encrypted `huntbase_session` HttpOnly cookie.

---

## 5. Scanner Engine & Camera Lifecycle

- **Mobile Camera Auto-Scan:** When users scan a physical QR code with their native iOS/Android camera, the URL carries `?token=...`. The scanner page automatically intercepts and verifies the token without forcing a manual re-scan.
- **Hardware Resource Release:** `html5-qrcode` scanner instances are monitored via `isScanning` flags and released in `useEffect` cleanup routines to prevent sensor lock on iOS Safari.
- **Haptic Feedback:** Triggers `navigator.vibrate([100, 50, 100])` upon verified scans.

---

## 6. Real-time WebSockets & Monitoring

- The hunt, progress, and admin monitoring pages poll Neon-backed API endpoints every five seconds.

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
