CREATE TABLE "event_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"paused_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resumed_at" timestamp with time zone,
	CONSTRAINT "event_pauses_order_check" CHECK ("event_pauses"."resumed_at" is null or "event_pauses"."resumed_at" >= "event_pauses"."paused_at")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"hunt_status" text DEFAULT 'draft' NOT NULL,
	"hunt_started_at" timestamp with time zone,
	"hunt_ended_at" timestamp with time zone,
	"hunt_duration_minutes" integer DEFAULT 60 NOT NULL,
	"hint_delay_minutes" integer DEFAULT 5 NOT NULL,
	"default_min_players" integer DEFAULT 2 NOT NULL,
	"default_max_players" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_hunt_status_check" CHECK ("events"."hunt_status" in ('draft', 'scheduled', 'active', 'paused', 'completed')),
	CONSTRAINT "events_time_order_check" CHECK ("events"."end_time" > "events"."start_time"),
	CONSTRAINT "events_duration_check" CHECK ("events"."hunt_duration_minutes" > 0),
	CONSTRAINT "events_hint_delay_check" CHECK ("events"."hint_delay_minutes" >= 0),
	CONSTRAINT "events_player_limits_check" CHECK ("events"."default_min_players" >= 1 and "events"."default_min_players" <= "events"."default_max_players")
);
--> statement-breakpoint
CREATE TABLE "fake_qr_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"clue_id" uuid NOT NULL,
	"qr_code_id" uuid NOT NULL,
	"scanned_by" uuid,
	"hint_was_used" boolean DEFAULT false NOT NULL,
	"points_awarded" integer DEFAULT 10 NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scans_team_clue_uq" UNIQUE("team_id","clue_id"),
	CONSTRAINT "scans_points_check" CHECK ("scans"."points_awarded" >= 0)
);
--> statement-breakpoint
CREATE TABLE "team_clue_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"clue_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"clue_started_at" timestamp with time zone,
	"hint_viewed" boolean DEFAULT false NOT NULL,
	"hint_viewed_at" timestamp with time zone,
	"hint_viewed_by" uuid,
	CONSTRAINT "team_clue_order_team_clue_uq" UNIQUE("team_id","clue_id"),
	CONSTRAINT "team_clue_order_team_step_uq" UNIQUE("team_id","step_index"),
	CONSTRAINT "team_clue_order_step_check" CHECK ("team_clue_order"."step_index" >= 0),
	CONSTRAINT "team_clue_order_hint_check" CHECK (not "team_clue_order"."hint_viewed" or "team_clue_order"."hint_viewed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "clues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"clue_text" text NOT NULL,
	"hint_text" text,
	"location_name" text,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clues_step_number_check" CHECK ("clues"."step_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"clue_id" uuid,
	"qr_token" text NOT NULL,
	"is_fake" boolean DEFAULT false NOT NULL,
	"redirect_url" text,
	"fake_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_codes_qr_token_unique" UNIQUE("qr_token"),
	CONSTRAINT "qr_codes_kind_check" CHECK (("qr_codes"."is_fake" and "qr_codes"."clue_id" is null) or (not "qr_codes"."is_fake" and "qr_codes"."clue_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "host_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"role" text DEFAULT 'club_admin' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_users_email_unique" UNIQUE("email"),
	CONSTRAINT "host_users_username_unique" UNIQUE("username"),
	CONSTRAINT "host_users_role_check" CHECK ("host_users"."role" in ('super_admin', 'club_admin'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo_url" text,
	"banner_url" text,
	"contact_email" text,
	"is_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"preset_id" text DEFAULT 'cyber-matrix' NOT NULL,
	"primary_color" text DEFAULT '#10b981' NOT NULL,
	"secondary_color" text DEFAULT '#064e3b' NOT NULL,
	"accent_color" text DEFAULT '#34d399' NOT NULL,
	"background_color" text DEFAULT '#09090b' NOT NULL,
	"card_color" text DEFAULT '#18181b' NOT NULL,
	"text_color" text DEFAULT '#fafafa' NOT NULL,
	"border_radius" text DEFAULT '0.5rem' NOT NULL,
	"font_family" text DEFAULT 'Inter' NOT NULL,
	"banner_url" text,
	"custom_css" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theme_configs_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "theme_configs_preset_check" CHECK ("theme_configs"."preset_id" in ('cyber-matrix', 'neon-kahoot', 'parchment-quest', 'arcade-80s', 'minimalist-mono', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"player_name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"gitam_email" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"team_name" text NOT NULL,
	"min_players" integer DEFAULT 2 NOT NULL,
	"max_players" integer DEFAULT 4 NOT NULL,
	"registration_status" text DEFAULT 'open' NOT NULL,
	"is_disqualified" boolean DEFAULT false NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"hunt_finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_current_step_check" CHECK ("teams"."current_step" >= 0),
	CONSTRAINT "teams_registration_status_check" CHECK ("teams"."registration_status" in ('open', 'full', 'closed')),
	CONSTRAINT "teams_player_limits_check" CHECK ("teams"."min_players" >= 1 and "teams"."min_players" <= "teams"."max_players")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"host_user_id" uuid,
	"team_member_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_one_owner_check" CHECK (("sessions"."host_user_id" is not null) <> ("sessions"."team_member_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "event_pauses" ADD CONSTRAINT "event_pauses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_qr_scans" ADD CONSTRAINT "fake_qr_scans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_qr_scans" ADD CONSTRAINT "fake_qr_scans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_qr_scans" ADD CONSTRAINT "fake_qr_scans_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_qr_scans" ADD CONSTRAINT "fake_qr_scans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fake_qr_scans" ADD CONSTRAINT "fake_qr_scans_player_id_team_members_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_clue_id_clues_id_fk" FOREIGN KEY ("clue_id") REFERENCES "public"."clues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_scanned_by_team_members_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_clue_order" ADD CONSTRAINT "team_clue_order_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_clue_order" ADD CONSTRAINT "team_clue_order_clue_id_clues_id_fk" FOREIGN KEY ("clue_id") REFERENCES "public"."clues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_clue_order" ADD CONSTRAINT "team_clue_order_hint_viewed_by_team_members_id_fk" FOREIGN KEY ("hint_viewed_by") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clues" ADD CONSTRAINT "clues_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_clue_id_clues_id_fk" FOREIGN KEY ("clue_id") REFERENCES "public"."clues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_users" ADD CONSTRAINT "host_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_host_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."host_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_configs" ADD CONSTRAINT "theme_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_user_id_host_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."host_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_pauses_one_open_idx" ON "event_pauses" USING btree ("event_id") WHERE "event_pauses"."resumed_at" is null;--> statement-breakpoint
CREATE INDEX "events_organization_idx" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fake_qr_scans_event_time_idx" ON "fake_qr_scans" USING btree ("event_id","scanned_at");--> statement-breakpoint
CREATE INDEX "scans_event_team_time_idx" ON "scans" USING btree ("event_id","team_id","scanned_at");--> statement-breakpoint
CREATE INDEX "team_clue_order_clue_idx" ON "team_clue_order" USING btree ("clue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clues_event_step_idx" ON "clues" USING btree ("event_id","step_number");--> statement-breakpoint
CREATE INDEX "qr_codes_event_idx" ON "qr_codes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "qr_codes_clue_idx" ON "qr_codes" USING btree ("clue_id");--> statement-breakpoint
CREATE INDEX "host_users_organization_idx" ON "host_users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "team_members_team_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_event_name_idx" ON "teams" USING btree ("event_id",lower("team_name"));--> statement-breakpoint
CREATE INDEX "teams_event_idx" ON "teams" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "teams_organization_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_host_user_idx" ON "sessions" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "sessions_team_member_idx" ON "sessions" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");