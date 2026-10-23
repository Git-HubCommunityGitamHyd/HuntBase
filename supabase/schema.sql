-- ==============================================================================
-- HUNTBASE (TECHSCAPADES PLATFORM) - MASTER UNIFIED DATABASE SCHEMA
-- ==============================================================================
-- Version: 3.0 (Multi-Tenant, White-Label Platform for Student Clubs)
-- Single-file idempotent setup for Supabase (PostgreSQL)
--
-- INCLUDES:
-- 1. Extensions (uuid-ossp, pgcrypto)
-- 2. Multi-Tenant Architecture (organizations, host_users, theme_configs)
-- 3. Core Game Engine (events, teams, team_members, clues, qr_codes, team_clue_order)
-- 4. Audit & Telemetry (scans, fake_qr_scans, password_reset_tokens)
-- 5. Performance Indexes
-- 6. Airtight Row Level Security (RLS) - Prevents player clue/QR answer leakage
-- 7. Supabase Storage (organization-assets bucket with 5MB limit)
-- 8. Supabase Realtime Publication (REPLICA IDENTITY FULL for sub-300ms leaderboards)
-- 9. Seed Data (Default Club: GitHub Community GITAM + Super Admin: admin / admin)
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. MULTI-TENANT TABLES
-- ==============================================================================

-- Organizations / Clubs hosting treasure hunts
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  contact_email TEXT,
  is_verified BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Club Host Admins & Platform Super Admins (Decoupled from teams table)
CREATE TABLE IF NOT EXISTS host_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'club_admin' CHECK (role IN ('super_admin', 'club_admin')),
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-Club Visual Branding Tokens ("Wix for Hunts")
CREATE TABLE IF NOT EXISTS theme_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  preset_id TEXT NOT NULL DEFAULT 'cyber-matrix' CHECK (
    preset_id IN ('cyber-matrix', 'neon-kahoot', 'parchment-quest', 'arcade-80s', 'minimalist-mono', 'custom')
  ),
  primary_color TEXT NOT NULL DEFAULT '#10b981',       -- Emerald / default primary
  secondary_color TEXT NOT NULL DEFAULT '#064e3b',     -- Deep emerald
  accent_color TEXT NOT NULL DEFAULT '#34d399',        -- Bright highlight
  background_color TEXT NOT NULL DEFAULT '#09090b',    -- Dark canvas (Zinc-950)
  card_color TEXT NOT NULL DEFAULT '#18181b',          -- Card surface (Zinc-900)
  text_color TEXT NOT NULL DEFAULT '#fafafa',          -- Foreground text
  border_radius TEXT NOT NULL DEFAULT '0.5rem',        -- shadcn border radius
  font_family TEXT NOT NULL DEFAULT 'Inter',           -- Font family
  banner_url TEXT,
  custom_css TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Host Admin Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES host_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. CORE HUNT GAME ENGINE TABLES
-- ==============================================================================

-- Treasure Hunt Events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT false,
  
  -- Lifecycle & Timers
  hunt_status TEXT NOT NULL DEFAULT 'draft' CHECK (hunt_status IN ('draft', 'scheduled', 'active', 'paused', 'completed')),
  hunt_started_at TIMESTAMPTZ,
  hunt_ended_at TIMESTAMPTZ,
  hunt_duration_minutes INTEGER DEFAULT 60,
  hint_delay_minutes INTEGER DEFAULT 5,
  
  -- Player capacity constraints
  default_min_players INTEGER DEFAULT 2,
  default_max_players INTEGER DEFAULT 4,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competing Teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  
  min_players INTEGER DEFAULT 2,
  max_players INTEGER DEFAULT 4,
  registration_status TEXT DEFAULT 'pending',
  
  -- Game state & progress
  score INTEGER DEFAULT 0,
  is_disqualified BOOLEAN DEFAULT false,
  current_step INTEGER DEFAULT 0,
  hunt_finished_at TIMESTAMPTZ,
  
  -- Legacy fallback credentials (admin users now use host_users table)
  is_admin BOOLEAN DEFAULT false,
  username TEXT,
  password_hash TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual Team Members / Players
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Riddles & Clues
CREATE TABLE IF NOT EXISTS clues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  clue_text TEXT NOT NULL,
  hint_text TEXT,
  location_name TEXT,
  admin_notes TEXT, -- Secret answer (only visible to admins via server API)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QR Code Tokens (Real location tokens + Fake prank rickrolls)
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  clue_id UUID REFERENCES clues(id) ON DELETE CASCADE,
  qr_token TEXT UNIQUE NOT NULL,
  
  is_fake BOOLEAN DEFAULT false,
  redirect_url TEXT,
  fake_label TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-Team Randomized Clue Paths (Prevents Campus Bottlenecks)
CREATE TABLE IF NOT EXISTS team_clue_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  clue_id UUID REFERENCES clues(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  
  clue_started_at TIMESTAMPTZ,
  hint_viewed BOOLEAN DEFAULT false,
  hint_viewed_at TIMESTAMPTZ,
  hint_viewed_by UUID REFERENCES team_members(id),
  
  UNIQUE(team_id, clue_id),
  UNIQUE(team_id, step_index)
);

-- Checkpoint Scan Telemetry
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  clue_id UUID REFERENCES clues(id) ON DELETE CASCADE,
  qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_by UUID REFERENCES team_members(id),
  hint_was_used BOOLEAN DEFAULT false,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(team_id, clue_id)
);

-- Decoy / Fake QR Scans ("Hall of Shame")
CREATE TABLE IF NOT EXISTS fake_qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 4. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_host_users_org ON host_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_host_users_email ON host_users(email);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_is_active ON events(is_active);
CREATE INDEX IF NOT EXISTS idx_teams_event ON teams(event_id);
CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_event_username ON teams(event_id, username);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_clues_event ON clues(event_id, step_number);
CREATE INDEX IF NOT EXISTS idx_qr_codes_token ON qr_codes(qr_token);
CREATE INDEX IF NOT EXISTS idx_qr_codes_clue ON qr_codes(clue_id);
CREATE INDEX IF NOT EXISTS idx_team_clue_order_team ON team_clue_order(team_id, step_index);
CREATE INDEX IF NOT EXISTS idx_scans_event ON scans(event_id);
CREATE INDEX IF NOT EXISTS idx_scans_team ON scans(team_id);
CREATE INDEX IF NOT EXISTS idx_fake_qr_scans_event ON fake_qr_scans(event_id);

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (AIRTIGHT ANTI-CHEAT DEFENSE)
-- ==============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE host_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clues ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_clue_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE fake_qr_scans ENABLE ROW LEVEL SECURITY;

-- Drop any conflicting legacy policies
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Publicly readable tables (needed by client UI components)
CREATE POLICY "Public read verified organizations" ON organizations
  FOR SELECT TO anon, authenticated USING (is_verified = true);

CREATE POLICY "Public read theme configurations" ON theme_configs
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public read active events" ON events
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "Public read team public info" ON teams
  FOR SELECT TO anon, authenticated USING (true);

-- Fully private sensitive tables (Completely blocked from anon Data API)
-- Access is mediated strictly server-side using the service role key
CREATE POLICY "Host users are private" ON host_users
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "Password reset tokens are private" ON password_reset_tokens
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "Team members are private" ON team_members
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "Clues are hidden from public Data API" ON clues
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "QR tokens are hidden from public Data API" ON qr_codes
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "Team clue order is private" ON team_clue_order
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "Scans are private" ON scans
  FOR ALL TO anon, authenticated USING (false);

CREATE POLICY "Fake scans are private" ON fake_qr_scans
  FOR ALL TO anon, authenticated USING (false);

-- ==============================================================================
-- 6. SUPABASE STORAGE (CLUB LOGOS & BANNERS)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'organization-assets',
  'organization-assets',
  true,
  5242880, -- 5MB limit
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];

DROP POLICY IF EXISTS "Public can view organization assets" ON storage.objects;
CREATE POLICY "Public can view organization assets" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'organization-assets');

-- ==============================================================================
-- 7. SUPABASE REALTIME CONFIGURATION
-- ==============================================================================
ALTER TABLE teams REPLICA IDENTITY FULL;
ALTER TABLE events REPLICA IDENTITY FULL;
ALTER TABLE scans REPLICA IDENTITY FULL;
ALTER TABLE fake_qr_scans REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'teams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scans;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'fake_qr_scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fake_qr_scans;
  END IF;
END $$;

-- ==============================================================================
-- 8. DEFAULT SEED DATA
-- ==============================================================================

-- 1. Default Club: GitHub Community GITAM
INSERT INTO organizations (id, name, slug, description, contact_email, is_verified)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'GitHub Community GITAM',
  'github-community',
  'Official student community of GitHub campus at GITAM University.',
  'gitamgithub@gmail.com',
  true
)
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 2. Default Cyber Matrix Theme Config
INSERT INTO theme_configs (
  organization_id,
  preset_id,
  primary_color,
  secondary_color,
  accent_color,
  background_color,
  card_color,
  text_color
)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'cyber-matrix',
  '#10b981',
  '#064e3b',
  '#34d399',
  '#09090b',
  '#18181b',
  '#fafafa'
)
ON CONFLICT (organization_id) DO NOTHING;

-- 3. Default Super Admin Account (admin / admin)
-- SHA-256 hash for 'admin': 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
INSERT INTO host_users (
  id,
  organization_id,
  email,
  username,
  password_hash,
  full_name,
  role
)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'admin@scramble.local',
  'admin',
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  'Super Administrator',
  'super_admin'
)
ON CONFLICT (username) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;
