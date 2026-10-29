# HuntBase - Gameplay API Contracts & Database Requirements
**Target:** Review 1 (October 31st Milestone)  
**Author:** Sai Harsha (Gameplay Backend)  
**Audience:** Midhil (Frontend & Integration) & Mohammed Owais (Database, Auth & Security)

---

## Part 1: Database Tables & Fields Needed by Gameplay Backend (For Owais / Neon DB)

The gameplay engine relies on **8 core tables** with specific fields, constraints, and relationships. Whether running on Supabase or Neon PostgreSQL, these tables and columns are required:

### 1. `events` (Hunt Lifecycle & Timing)
```sql
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT false,
  
  -- Lifecycle & Timers (Critical for Gameplay)
  hunt_status TEXT NOT NULL DEFAULT 'draft' CHECK (hunt_status IN ('draft', 'scheduled', 'active', 'paused', 'completed')),
  hunt_started_at TIMESTAMPTZ,
  hunt_ended_at TIMESTAMPTZ,
  hunt_duration_minutes INTEGER DEFAULT 60,
  hint_delay_minutes INTEGER DEFAULT 5,
  
  -- Capacity
  default_min_players INTEGER DEFAULT 2,
  default_max_players INTEGER DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. `teams` (Team State & Progress)
```sql
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  current_step INTEGER DEFAULT 0,
  is_disqualified BOOLEAN DEFAULT false,
  hunt_finished_at TIMESTAMPTZ,
  min_players INTEGER DEFAULT 2,
  max_players INTEGER DEFAULT 4,
  registration_status TEXT DEFAULT 'open',
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. `team_members` (Player Accounts)
```sql
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  gitam_email TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. `clues` (Riddles & Checkpoints)
```sql
CREATE TABLE IF NOT EXISTS clues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  clue_text TEXT NOT NULL,
  hint_text TEXT,
  location_name TEXT,     -- Private (must be stripped from player payloads)
  admin_notes TEXT,       -- Private (must be stripped from player payloads)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. `qr_codes` (Physical QR Tokens & Prank Traps)
```sql
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  clue_id UUID REFERENCES clues(id) ON DELETE CASCADE,  -- NULL for decoy traps
  qr_token TEXT UNIQUE NOT NULL,
  is_fake BOOLEAN DEFAULT false,
  redirect_url TEXT,       -- Rickroll destination
  fake_label TEXT,         -- Decoy label shown in Hall of Shame
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. `team_clue_order` (Anti-Crowding Round-Robin Path & Hint Timers)
```sql
CREATE TABLE IF NOT EXISTS team_clue_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  clue_id UUID REFERENCES clues(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,          -- 0, 1, 2... sequence for this team
  clue_started_at TIMESTAMPTZ,          -- Set when team first views this clue (initiates hint timer)
  hint_viewed BOOLEAN DEFAULT false,
  hint_viewed_at TIMESTAMPTZ,
  hint_viewed_by UUID REFERENCES team_members(id),
  
  UNIQUE(team_id, clue_id),
  UNIQUE(team_id, step_index)
);
```

### 7. `scans` (Verified Checkpoint Telemetry & Scoring Log)
```sql
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  clue_id UUID REFERENCES clues(id) ON DELETE CASCADE,
  qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_by UUID REFERENCES team_members(id),
  hint_was_used BOOLEAN DEFAULT false,
  points_awarded INTEGER DEFAULT 10,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(team_id, clue_id)              -- Anti-double scan constraint
);
```

### 8. `fake_qr_scans` (Decoy Trap Telemetry / "Hall of Shame")
```sql
CREATE TABLE IF NOT EXISTS fake_qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Part 2: Gameplay API Endpoints & Request/Response Contracts (For Midhil / Frontend)

All gameplay endpoints adhere to standard REST semantics and JSON payloads.

---

### 1. Fetch Current Clue & Timer Status
`POST /api/hunt/current-clue`

Returns the team's active riddle. Enforces zero data leakage (strips coordinates, location names, and secret solutions). Only exposes `hint_text` if the team has unlocked the hint penalty.

- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "team_id": "c1f7b09e-711e-450a-81a1-94916a4b189b"
  }
  ```
- **Success Response (`200 OK` - Hunt in Progress):**
  ```json
  {
    "success": true,
    "isComplete": false,
    "clue": {
      "id": "893c563e-5f60-44be-bb78-f32a762080a2",
      "step_number": 2,
      "clue_text": "I speak without a mouth and hear without ears...",
      "has_hint": true,
      "hint_text": null
    },
    "clueOrder": {
      "id": "3e9b1f23-42e1-4bda-a889-8d76e4c76b10",
      "step_index": 1,
      "clue_started_at": "2026-10-31T10:05:00.000Z",
      "hint_viewed": false,
      "hint_viewed_at": null,
      "seconds_until_hint_available": 180
    },
    "totalClues": 5,
    "currentStep": 1,
    "score": 10,
    "event": {
      "id": "d04b3e69-0e78-43bb-a5a4-569d120a109a",
      "name": "Halloween Campus Hunt 2026",
      "hunt_status": "active",
      "hunt_started_at": "2026-10-31T10:00:00.000Z",
      "hunt_duration_minutes": 60,
      "hint_delay_minutes": 5,
      "hunt_time_remaining_seconds": 3300
    }
  }
  ```
- **Success Response (`200 OK` - Hunt Completed):**
  ```json
  {
    "success": true,
    "isComplete": true,
    "totalClues": 5,
    "currentStep": 5,
    "score": 45,
    "hunt_finished_at": "2026-10-31T10:48:12.000Z"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `{"success": false, "message": "team_id is required"}`
  - `403 Forbidden`: `{"success": false, "message": "The hunt has not started yet"}`
  - `404 Not Found`: `{"success": false, "message": "Team not found"}`

---

### 2. View / Unlock Hint (With Score Penalty)
`POST /api/hints/view`

Unlocks the clue hint once `hint_delay_minutes` has elapsed since `clue_started_at`. Deducts 5 potential points (scan yields +5 instead of +10).

- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "team_id": "c1f7b09e-711e-450a-81a1-94916a4b189b",
    "clue_id": "893c563e-5f60-44be-bb78-f32a762080a2",
    "player_id": "a90a2103-61de-4660-84c6-e63bd8a23055"
  }
  ```
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Hint viewed! Points for this clue reduced to +5",
    "hint_text": "Look near the entrance of the electrical engineering department.",
    "already_viewed": false
  }
  ```
- **Timer Not Elapsed Response (`400 Bad Request`):**
  ```json
  {
    "success": false,
    "message": "Hint not available yet. Wait 3 more minutes.",
    "remaining_seconds": 180
  }
  ```
- **Error Responses:**
  - `403 Forbidden`: `{"success": false, "message": "Team is disqualified or hunt is not active"}`

---

### 3. Checkpoint QR Scan Processing
`POST /api/scan`

Called whenever a QR code is scanned via camera or typed manually. Handles both valid checkpoints and decoy traps.

- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "token": "QR_A1B2C3D4E5F6G7H8",
    "team_id": "c1f7b09e-711e-450a-81a1-94916a4b189b",
    "player_id": "a90a2103-61de-4660-84c6-e63bd8a23055"
  }
  ```
- **Success Response (`200 OK` - Valid Checkpoint):**
  ```json
  {
    "success": true,
    "message": "Checkpoint Verified! +10 points. Move to the next clue!",
    "pointsEarned": 10,
    "newScore": 20,
    "nextStep": 2,
    "isComplete": false,
    "hintUsed": false
  }
  ```
- **Success Response (`200 OK` - Final Checkpoint / Victory):**
  ```json
  {
    "success": true,
    "message": "🎉 Victory! Your team has solved all clues and finished the hunt!",
    "pointsEarned": 10,
    "newScore": 50,
    "nextStep": 5,
    "isComplete": true,
    "hintUsed": false
  }
  ```
- **Decoy Trap Response (`200 OK` - Prank / Rickroll):**
  ```json
  {
    "success": false,
    "isFake": true,
    "message": "😈 Decoy Checkpoint! You scanned a decoy QR code!",
    "redirect_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "fake_label": "Rickroll Trap"
  }
  ```
- **Error Responses:**
  - `400 Bad Request` (Wrong Clue): `{"success": false, "message": "Wrong checkpoint! This is not your team's assigned next clue."}`
  - `400 Bad Request` (Already Scanned): `{"success": false, "message": "Your team has already verified this clue!"}`
  - `400 Bad Request` (Hunt Already Completed): `{"success": false, "message": "Your team has already completed the hunt!"}`
  - `403 Forbidden` (Hunt Expired): `{"success": false, "message": "Time's up! The hunt has ended."}`
  - `403 Forbidden` (Hunt Paused): `{"success": false, "message": "The hunt is currently paused by organizers."}`

---

### 4. Live Leaderboard
`GET /api/hunt/leaderboard?event_id=<uuid>`

Returns public-safe live standings calculated with standard competitive tie-breakers:
1. `score` DESC
2. `is_complete` DESC
3. `completion_time` ASC (`hunt_finished_at` - `hunt_started_at`)
4. `current_step` DESC
5. `latest_scan_at` ASC

- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "event": {
      "id": "d04b3e69-0e78-43bb-a5a4-569d120a109a",
      "name": "Halloween Campus Hunt 2026",
      "hunt_status": "active",
      "total_clues": 5
    },
    "leaderboard": [
      {
        "rank": 1,
        "team_id": "c1f7b09e-711e-450a-81a1-94916a4b189b",
        "team_name": "CyberKnights",
        "score": 50,
        "current_step": 5,
        "is_complete": true,
        "hunt_finished_at": "2026-10-31T10:42:15.000Z",
        "duration_minutes": 42.25
      },
      {
        "rank": 2,
        "team_id": "b82e1c94-18de-4340-84a1-00128a3011ef",
        "team_name": "ByteBandits",
        "score": 45,
        "current_step": 5,
        "is_complete": true,
        "hunt_finished_at": "2026-10-31T10:47:00.000Z",
        "duration_minutes": 47.00
      },
      {
        "rank": 3,
        "team_id": "a11b22c3-33d4-44e5-55f6-66a77b88c99d",
        "team_name": "CodeCrackers",
        "score": 30,
        "current_step": 3,
        "is_complete": false,
        "hunt_finished_at": null,
        "duration_minutes": null
      }
    ]
  }
  ```

---

### 5. Host Admin Game Control
- **`POST /api/admin/events/start-hunt`**
  - **Body:** `{"event_id": "<uuid>"}`
  - **Action:** Generates round-robin clue sequence for all teams, resets scores/steps to 0, sets `hunt_status: 'active'`, stamps `hunt_started_at: NOW()`.
- **`POST /api/admin/events/pause-hunt`**
  - **Body:** `{"event_id": "<uuid>"}`
  - **Action:** Toggles `hunt_status` between `'paused'` and `'active'`.
- **`POST /api/admin/events/stop-hunt`**
  - **Body:** `{"event_id": "<uuid>"}`
  - **Action:** Sets `hunt_status: 'completed'`, stamps `hunt_ended_at: NOW()`.
- **`POST /api/admin/teams/score`**
  - **Body:** `{"team_id": "<uuid>", "adjustment": 5 | -5}`
  - **Action:** Manual referee score bonus/penalty (multiples of 5).
- **`POST /api/admin/qr/generate`**
  - **Body:** `{"event_id": "<uuid>"}`
  - **Action:** Generates QR tokens and returns a base64 `.zip` package containing high-res checkpoint and decoy QR codes for printing.

---

### 6. Realtime Events to Subscribe (For Midhil's UI)
For sub-300ms live displays, listen to these Postgres changes:
- `teams` table (`UPDATE`): To update live team scores and step counts.
- `events` table (`UPDATE`): To detect `hunt_status` transitions (`active`, `paused`, `completed`).
- `team_clue_order` table (`UPDATE`): To synchronize hint reveals across multiple members of the same team.
- `fake_qr_scans` table (`INSERT`): To append new decoy victims to the live "Hall of Shame".
