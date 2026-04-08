CREATE TABLE "group_canvas_states" (
	"group_id" text PRIMARY KEY NOT NULL,
	"layout" jsonb DEFAULT '{"viewport":{"zoom":1,"offset":{"x":0,"y":0}},"nodes":[],"edges":[]}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"space_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_space_slug_unique" UNIQUE("space_id","slug")
);
--> statement-breakpoint
ALTER TABLE "document_entity_mentions" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "relations" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "saved_views" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "group_canvas_states" ADD CONSTRAINT "group_canvas_states_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_canvas_states" ADD CONSTRAINT "group_canvas_states_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_canvas_states" ADD CONSTRAINT "group_canvas_states_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "groups_workspace_idx" ON "groups" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "groups_space_idx" ON "groups" USING btree ("space_id");--> statement-breakpoint
ALTER TABLE "document_entity_mentions" ADD CONSTRAINT "document_entity_mentions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_entity_mentions_group_idx" ON "document_entity_mentions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "documents_group_idx" ON "documents" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "entities_group_idx" ON "entities" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "relations_group_idx" ON "relations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "saved_views_group_idx" ON "saved_views" USING btree ("group_id");