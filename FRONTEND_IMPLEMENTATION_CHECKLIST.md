# HuntBase Frontend Implementation & Integration Checklist

**Project:** HuntBase — Multi-Tenant Campus Treasure Hunt Platform  
**Target Backend:** Neon PostgreSQL + Next.js API Routes  
**Date:** 2026-10-29  

---

## 1. Frontend Pages Using Supabase Directly

The following frontend pages currently import and instantiate the browser Supabase client directly (for real-time subscriptions or direct reads):

1. **`src/app/hunt/page.tsx`**
   - Direct Supabase usage: Subscribes to Realtime channels (`event-updates`, `team_clue_order-updates`) and fetches event data on mount.
   - Action for Neon: Replace Supabase Realtime with polling or SSE / WebSockets, and route event data fetching through backend API routes.
2. **`src/app/progress/page.tsx`**
   - Direct Supabase usage: Subscribes to `scans` Realtime table changes and queries `events` table directly.
   - Action for Neon: Route event fetching and progress sync through authorized backend endpoints (`/api/hunt/progress`, `/api/events/...`).
3. **`src/app/admin/monitor/page.tsx`**
   - Direct Supabase usage: Subscribes to `scans`, `fake_qr_scans`, and `events` Realtime tables, alongside team state polling.
   - Action for Neon: Replace Supabase Realtime subscriptions with backend-driven polling or SSE channels.

---

## 2. API Endpoints Called by Each Frontend Page

| Page (`src/app/...`) | API Endpoints Called |
|---|---|
| **`/login`** | `POST /api/auth/login` |
| **`/register`** | `GET /api/teams/available`, `POST /api/auth/register` |
| **`/hunt`** | `GET /api/teams/[id]`, `POST /api/hunt/current-clue`, `POST /api/hints/view` |
| **`/scan`** | `POST /api/scan` |
| **`/progress`** | `GET /api/teams/[id]`, `GET /api/hunt/progress?team_id=...` |
| **`/admin-login`** | `POST /api/auth/admin-login` |
| **`/admin/events`** | `GET /api/admin/events`, `POST /api/admin/events`, `PUT /api/admin/events`, `DELETE /api/admin/events` |
| **`/admin/clues`** | `GET /api/admin/clues`, `POST /api/admin/clues`, `PUT /api/admin/clues`, `DELETE /api/admin/clues` |
| **`/admin/teams`** | `GET /api/admin/teams`, `POST /api/admin/teams`, `POST /api/admin/teams/generate`, `PUT /api/admin/teams`, `DELETE /api/admin/teams` |
| **`/admin/qr-codes`** | `POST /api/admin/qr/generate` |
| **`/admin/monitor`** | `GET /api/admin/events`, `GET /api/admin/clues`, `GET /api/admin/monitor`, `GET /api/admin/fake-qr-scans`, `PUT /api/admin/teams`, `POST /api/admin/teams/score`, `PUT /api/admin/events` |

---

## 3. Reusable UI Components (Zero Changes Required)

The following components in `src/components/ui/` and layouts are fully reusable as-is:
- **Primitives**: `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Input`, `Label`, `Textarea`, `Badge`, `Alert`, `AlertDescription`, `Progress`, `Select`, `Dialog`, `Tabs`, `Table`.
- **Layouts & Contexts**: 
  - `AuthProvider` (`src/contexts/AuthContext.tsx`) — Manages player/team session state and localStorage cache.
  - `AdminLayout` (`src/app/admin/layout.tsx`) — Responsive sidebar navigation and admin session hydration.

---

## 4. Pages Requiring Modifications for Neon Backend

1. **`src/app/hunt/page.tsx`**
   - Remove Supabase client import.
   - Replace Realtime channel subscriptions with periodic polling or API-driven event updates.
2. **`src/app/progress/page.tsx`**
   - Remove direct Supabase event queries.
   - Fetch event details through a dedicated backend API route rather than direct client table access.
3. **`src/app/admin/monitor/page.tsx`**
   - Remove Supabase Realtime subscriptions for `scans` and `fake_qr_scans`.
   - Rely on robust polling intervals (already present as fallback) or backend-supplied SSE streams.

---

## 5. Missing or Incomplete Frontend Features

1. **Theme Customizer UI**: `src/app/admin/theme/page.tsx` (mentioned in roadmap/pending docs but needs complete implementation to drive branding presets and custom CSS variables).
2. **Dynamic Theme Context**: `src/contexts/ThemeContext.tsx` to inject club branding tokens into Tailwind CSS `:root` variables.
3. **Player Profile / Team Management Page**: Dedicated participant view for managing team roster members and credentials.
4. **End-to-End Test Suite**: Playwright smoke tests for participant hunt flow and admin dashboard management.
