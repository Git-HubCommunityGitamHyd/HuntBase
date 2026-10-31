CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_member_id" uuid NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verifications_attempts_check" CHECK ("email_verifications"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_verifications_one_active_idx" ON "email_verifications" USING btree ("team_member_id") WHERE "email_verifications"."consumed_at" is null;--> statement-breakpoint
CREATE INDEX "email_verifications_member_time_idx" ON "email_verifications" USING btree ("team_member_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_verified_email_idx" ON "team_members" USING btree (lower("gitam_email")) WHERE "team_members"."is_verified";--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_verified_email_check" CHECK (not "team_members"."is_verified" or "team_members"."gitam_email" is not null);