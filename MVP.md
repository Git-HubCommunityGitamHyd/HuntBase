# HuntBase - Multi-Tenant Campus Treasure Hunt Platform

## MVP & Architecture Specification

HuntBase is a white-label, multi-tenant campus treasure hunt platform built by GitHub Community GITAM. Student clubs and campus organizations can independently launch customized, branded hunts with dynamic themes, randomized clues, anti-cheat QR validation, live sub-300ms monitoring, and real-time leaderboards.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript | Server Components, dynamic routes, fast hydration |
| **Styling** | Tailwind CSS v4, shadcn/ui | CSS variable theme tokens, dark/light mode responsive |
| **Backend** | Next.js API Routes, HttpOnly Cookies | Secure session middleware, administrative endpoints |
| **Database** | Supabase (PostgreSQL 15+) | 12 tables, Row Level Security (RLS), ACID constraints |
| **Auth** | Multi-Tier Cookie & Token Auth | Club host credentials + individual team passwords |
| **Realtime** | Supabase Realtime (WebSockets) | Live monitoring with `REPLICA IDENTITY FULL` |
| **Storage** | Supabase Storage (`organization-assets`) | Club logos, custom banners (5MB limit, CDN delivery) |
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
- 📊 **Real-Time Host Dashboard**: Sub-300ms WebSocket updates tracking team progress, scan logs, and scores.

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
│   └── /admin/monitor             (Real-time live team board & map)
│
└── Supabase Backend
    ├── Master Schema              (supabase/schema.sql - 12 public tables)
    ├── Row Level Security (RLS)   (Direct anon SELECT blocked on secret tables)
    ├── Realtime Engine            (teams, events, scans, fake_qr_scans)
    └── Storage Bucket             (organization-assets with 5MB upload limit)
```

---

## 🗄️ Database Tables (12 Public Tables)

1. `organizations`: Tenant clubs (slug, name, verified status).
2. `host_users`: Club organizers and super-admins with hashed credentials.
3. `theme_configs`: Club visual identity (colors, fonts, banners, logos).
4. `password_reset_tokens`: Secure token management for host recovery.
5. `events`: Hunt events with start/end timestamps and hint delay intervals.
6. `teams`: Competing groups with unique usernames, scores, and status.
7. `team_members`: Individual player roster per team.
8. `clues`: Hunt riddles, point values, hints, and secret coordinates.
9. `qr_codes`: Encrypted tokens linked to clues and physical locations.
10. `team_clue_order`: Randomized round-robin sequence per team.
11. `scans`: Validated checkpoint logs with timestamps and score delta.
12. `fake_qr_scans`: Decoy scan records feeding the Hall of Shame.

---

*Authored and maintained by GitHub Community GITAM*
