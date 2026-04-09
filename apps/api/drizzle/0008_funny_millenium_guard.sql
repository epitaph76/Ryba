CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"connection_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_workspace_name_unique" UNIQUE("workspace_id","name")
);
--> statement-breakpoint
CREATE TABLE "query_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"space_id" text NOT NULL,
	"group_id" text,
	"data_source_id" text NOT NULL,
	"saved_query_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"status" text NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_queries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"space_id" text NOT NULL,
	"group_id" text,
	"data_source_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sql_template" text NOT NULL,
	"parameter_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_saved_query_id_saved_queries_id_fk" FOREIGN KEY ("saved_query_id") REFERENCES "public"."saved_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_runs" ADD CONSTRAINT "query_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries" ADD CONSTRAINT "saved_queries_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_sources_workspace_idx" ON "data_sources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "query_runs_workspace_idx" ON "query_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "query_runs_space_idx" ON "query_runs" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "query_runs_group_idx" ON "query_runs" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "query_runs_data_source_idx" ON "query_runs" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX "query_runs_saved_query_idx" ON "query_runs" USING btree ("saved_query_id");--> statement-breakpoint
CREATE INDEX "query_runs_actor_idx" ON "query_runs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "query_runs_started_at_idx" ON "query_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "saved_queries_workspace_idx" ON "saved_queries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "saved_queries_space_idx" ON "saved_queries" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "saved_queries_group_idx" ON "saved_queries" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "saved_queries_data_source_idx" ON "saved_queries" USING btree ("data_source_id");