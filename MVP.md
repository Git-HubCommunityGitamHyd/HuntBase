# HuntBase - Multi-Tenant Campus Treasure Hunt Platform

## MVP & Architecture Specification

HuntBase is a white-label, multi-tenant campus treasure hunt platform built by GitHub Community GITAM. Student clubs and campus organizations can launch customized hunts with dynamic themes, randomized clues, anti-cheat QR validation, live monitoring refreshed every five seconds, and leaderboards.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript | Server Components, dynamic routes, fast hydration |
| **Styling** | Tailwind CSS v4, shadcn/ui | CSS variable theme tokens, dark/light mode responsive |
| **Backend** | Next.js API Routes, HttpOnly Cookies | Secure session middleware, administrative endpoints |
| **Database** | Neon PostgreSQL with Drizzle ORM | PostgreSQL transactions and schema-managed migrations |
| **Auth** | Database-backed HttpOnly sessions | Club admin credentials + individual player passwords; GITAM email verification gates gameplay scans |
| **Live Updates** | Polling API endpoints | Hunt and admin dashboards refresh every five seconds |
| **Storage** | Neon PostgreSQL (`bytea`) | Club logos and banners (5MB limit) |
| **QR Engine** | html5-qrcode & server qrcode | Native mobile camera scanner + server PNG/SVG batch generation |

---

## 🌟 Features

### ✅ Core Platform Features
- 🏢 **Multi-Tenant Club Isolation**: Each club operates within its isolated organization domain (`organization_id`).
- 🎨 **White-Label Theme Engine**: Dynamic branding presets (*Cyber Matrix*, *Neon Pulse*, *Parchment Quest*, *Arcade 80s*, *Minimalist Mono*), custom hex tokens, and asset uploads.
- 🎲 **Anti-Crowding Round-Robin**: Clues are distributed across starting points so teams do not follow each other physically.
- 📱 **Native Camera QR Scanner**: Zero-latency scanning with automatic `?token=` parameter extraction from native iOS/Android camera apps.
- 🔒 **Zero DevTools Answer Leaks**: Clue locations and admin notes are stripped at the server layer (`/api/hunt/current-clue`).
- ⏱️ **Synchronized Hunt Countdown**: Global timer with automatic lockouts when the hunt expires.
- 💡 **Balanced Hint Economy**: Delayed hint reveals with automatic point deductions (10 points unassisted vs 5 points with hint).
- 🎭 **Rickroll Decoy Traps**: Physical fake QR codes log scans into a live "Hall of Shame".
- 📊 **Live Host Dashboard**: API polling refreshes team progress, scan logs, and scores every five seconds.

---

## 🏗️ Architecture

```
HuntBase Platform
│
├── Participant Web App (Mobile-First)
│   ├── /login                     (Team & event credentials)
│   ├── /hunt                      (Current riddle & clues - secure API)
│   ├── /scan                      (Native camera scanner with auto-redirect)
│   └── /progress                  (Team status & completion lock)
│
├── Club Host Admin Dashboard
│   ├── /admin/events              (Create & schedule hunts)
│   ├── /admin/clues               (Riddles, locations & hints)
│   ├── /admin/teams               (Bulk account generation & credentials)
│   ├── /admin/qr-codes            (Batch QR generation & ZIP export)
│   ├── /admin/theme               (Theme customizer & logo uploader)
│   └── /admin/monitor             (Polling live team board & map)
│
└── Neon Backend
    ├── Drizzle Schema              (src/db/schema)
    ├── SQL Migrations              (migrations/)
    ├── Session and API guards      (HttpOnly cookies and database checks)
    └── Organization Assets         (PostgreSQL bytea, 5MB upload limit)
```

---

## 🗄️ Database Tables (16 Public Tables)

Organization: `organizations`, `host_users`, `theme_configs`, `password_reset_tokens`, `organization_assets`.

Events: `events`, `event_pauses`.

Teams and identity: `teams`, `team_members`, `sessions`, `email_verifications`.

Hunt and gameplay: `clues`, `qr_codes`, `team_clue_order`, `scans`, `fake_qr_scans`.

Player credentials belong to `team_members`. Admins and players use database-backed HttpOnly sessions. Deletion behavior follows the foreign keys in `src/db/schema`: for example, deleting a team cascades to its members and gameplay rows, while organization deletion is restricted when events or host users still reference it.

---

*Authored and maintained by GitHub Community GITAM*
