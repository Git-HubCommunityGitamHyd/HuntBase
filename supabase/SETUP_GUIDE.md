# HuntBase - Supabase Setup Guide

Follow these steps to set up the **HuntBase** multi-tenant platform database in your Supabase account.

---

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **"New Project"**.
3. Fill in:
   - **Organization:** Select your team / club account
   - **Project Name:** `huntbase` (or similar)
   - **Database Password:** Generate a strong password and **save it somewhere secure!**
   - **Region:** Select `South Asia (Mumbai)` for best performance in India (or nearest region)
4. Click **"Create new project"** and wait ~2 minutes for provisioning.

---

## Step 2: Configure Environment Variables

1. Go to **Project Settings** (⚙️ gear icon) → **API**
2. Copy these 3 credentials into your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... (under "Project API keys" -> anon)
SUPABASE_SERVICE_ROLE_KEY=eyJ... (under "Project API keys" -> service_role)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 3: Run the Single Unified Schema (`schema.sql`)

Everything—all tables, security policies, storage buckets, Realtime publications, and default seed accounts—is unified into **one single script**:

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar).
2. Click **"New query"**.
3. Open [`supabase/schema.sql`](./schema.sql) and copy the entire file.
4. Paste it into the SQL Editor and click **"Run"**.
5. You should see *"Success. No rows returned"*.

### What gets created automatically:
* ✅ **12 Public Tables:**
  - `organizations` — Campus clubs, departments, and fests
  - `host_users` — Club organizers and platform super admins
  - `theme_configs` — Visual branding tokens (presets, primary/accent colors)
  - `password_reset_tokens` — Self-service host password recovery
  - `events` — Treasure hunt events with timers & lifecycle status
  - `teams` — Competing student teams
  - `team_members` — Individual player login accounts
  - `clues` — Riddles and hints
  - `qr_codes` — Scannable checkpoint tokens + decoy prank QRs
  - `team_clue_order` — Anti-bottleneck randomized clue paths
  - `scans` — Verified checkpoint scan telemetry
  - `fake_qr_scans` — "Hall of Shame" decoy tracker
* ✅ **Storage Bucket:** `organization-assets` (5MB limit, PNG/JPEG/SVG/WebP) for club logos and banners.
* ✅ **Airtight RLS:** Clue answers and secret QR tokens are hidden from the public Data API.
* ✅ **Realtime Streams:** `REPLICA IDENTITY FULL` enabled on `teams`, `events`, and `scans` for live leaderboards.
* ✅ **Default Club & Super Admin:**
  - **Club:** GitHub Community GITAM (`slug: github-community`)
  - **Super Admin Username:** `admin`
  - **Super Admin Password:** `admin`
  - **Admin Login URL:** `http://localhost:3000/admin-login`

---

## Step 4: Verify Local Development Server

Run the development server:
```bash
npm install
npm run dev
```

Visit:
- **Landing Page:** [http://localhost:3000](http://localhost:3000)
- **Admin Dashboard:** [http://localhost:3000/admin-login](http://localhost:3000/admin-login) (Log in with `admin` / `admin`)
- **Player Register:** [http://localhost:3000/register](http://localhost:3000/register)
- **Player Hunt:** [http://localhost:3000/hunt](http://localhost:3000/hunt)
