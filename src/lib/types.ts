// Database types for Supabase tables

export type ThemePreset = 
  | 'cyber-matrix'
  | 'neon-pulse'
  | 'parchment-quest'
  | 'arcade-80s'
  | 'minimalist-mono'
  | 'custom';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  contact_email: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface HostUser {
  id: string;
  organization_id: string;
  email: string;
  username: string;
  full_name: string;
  role: 'super_admin' | 'club_admin';
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeConfig {
  id: string;
  organization_id: string;
  preset_id: ThemePreset;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  card_color: string;
  text_color: string;
  border_radius: string;
  font_family: string;
  banner_url?: string | null;
  custom_css?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export type HuntStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';

export interface Event {
  id: string;
  organization_id?: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  // Timer & settings
  hunt_started_at?: string | null;
  hunt_ended_at?: string | null;
  hunt_duration_minutes?: number;
  hint_delay_minutes?: number;
  hunt_status?: HuntStatus;
  default_min_players?: number;
  default_max_players?: number;
}

export interface Team {
  id: string;
  organization_id?: string;
  event_id: string;
  team_name: string;
  username: string | null; // Now optional - players register with individual accounts
  password_hash: string | null; // Now optional
  score: number;
  is_disqualified: boolean;
  current_step: number;
  is_admin: boolean;
  created_at: string;
  // New fields
  min_players?: number;
  max_players?: number;
  registration_status?: 'open' | 'full' | 'closed';
  hunt_finished_at?: string | null;
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_name: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface Clue {
  id: string;
  event_id: string;
  step_number: number;
  clue_text: string;
  location_name: string | null;
  admin_notes: string | null;
  created_at: string;
  // New field
  hint_text?: string | null;
}

export interface QRCode {
  id: string;
  event_id: string;
  clue_id: string;
  qr_token: string;
  created_at: string;
  // New fields for fake QRs
  is_fake?: boolean;
  redirect_url?: string | null;
  fake_label?: string | null;
}

export interface TeamClueOrder {
  id: string;
  team_id: string;
  clue_id: string;
  step_index: number;
  // New fields for hint tracking
  clue_started_at?: string | null;
  hint_viewed?: boolean;
  hint_viewed_at?: string | null;
  hint_viewed_by?: string | null;
}

export interface Scan {
  id: string;
  organization_id?: string;
  event_id?: string;
  team_id: string;
  clue_id: string;
  qr_code_id: string;
  scanned_at: string;
  // New fields
  scanned_by?: string | null; // team_member id
  hint_was_used?: boolean;
}

export interface FakeQRScan {
  id: string;
  organization_id?: string;
  event_id?: string;
  qr_code_id: string;
  team_id: string;
  player_id: string;
  scanned_at: string;
}

// API Response types
export interface ScanResponse {
  success: boolean;
  message: string;
  newScore?: number;
  nextStep?: number;
  isComplete?: boolean;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  team?: Team;
  hostUser?: HostUser;
}

// Form types
export interface CreateEventForm {
  name: string;
  start_time: string;
  end_time: string;
  organization_id?: string;
}

export interface CreateClueForm {
  clue_text: string;
  location_name?: string;
  admin_notes?: string;
}

export interface CreateTeamForm {
  team_name: string;
}

// Admin types
export interface TeamWithProgress extends Team {
  last_scan_time?: string;
  clue_name?: string;
}

export interface GenerateTeamsRequest {
  event_id: string;
  count: number;
  prefix?: string;
}

export interface GeneratedTeamCredential {
  team_name: string;
  username: string;
  password: string;
}

// Database types for Supabase client
export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>>;
      };
      host_users: {
        Row: HostUser;
        Insert: Omit<HostUser, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<HostUser, 'id' | 'created_at' | 'updated_at'>>;
      };
      theme_configs: {
        Row: ThemeConfig;
        Insert: Omit<ThemeConfig, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<ThemeConfig, 'id' | 'created_at' | 'updated_at'>>;
      };
      password_reset_tokens: {
        Row: PasswordResetToken;
        Insert: Omit<PasswordResetToken, 'id' | 'created_at'>;
        Update: Partial<Omit<PasswordResetToken, 'id' | 'created_at'>>;
      };
      events: {
        Row: Event;
        Insert: Omit<Event, 'id' | 'created_at'>;
        Update: Partial<Omit<Event, 'id' | 'created_at'>>;
      };
      teams: {
        Row: Team;
        Insert: Omit<Team, 'id' | 'created_at'>;
        Update: Partial<Omit<Team, 'id' | 'created_at'>>;
      };
      clues: {
        Row: Clue;
        Insert: Omit<Clue, 'id' | 'created_at'>;
        Update: Partial<Omit<Clue, 'id' | 'created_at'>>;
      };
      qr_codes: {
        Row: QRCode;
        Insert: Omit<QRCode, 'id' | 'created_at'>;
        Update: Partial<Omit<QRCode, 'id' | 'created_at'>>;
      };
      team_clue_order: {
        Row: TeamClueOrder;
        Insert: Omit<TeamClueOrder, 'id'>;
        Update: Partial<Omit<TeamClueOrder, 'id'>>;
      };
      scans: {
        Row: Scan;
        Insert: Omit<Scan, 'id' | 'scanned_at'>;
        Update: Partial<Omit<Scan, 'id' | 'scanned_at'>>;
      };
      fake_qr_scans: {
        Row: FakeQRScan;
        Insert: Omit<FakeQRScan, 'id' | 'scanned_at'>;
        Update: Partial<Omit<FakeQRScan, 'id' | 'scanned_at'>>;
      };
    };
  };
};
