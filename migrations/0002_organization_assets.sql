CREATE TABLE IF NOT EXISTS "organization_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"asset_type" text NOT NULL,
	"content_type" text NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_assets_org_idx" ON "organization_assets" USING btree ("organization_id");
