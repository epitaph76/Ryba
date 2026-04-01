DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.tables
		WHERE table_schema = 'public'
		  AND table_name = 'space_canvas_states'
	) THEN
		CREATE TABLE "space_canvas_states" (
			"space_id" text PRIMARY KEY NOT NULL,
			"layout" jsonb DEFAULT '{"nodes":[],"edges":[],"viewport":{"zoom":1,"offset":{"x":0,"y":0}}}'::jsonb NOT NULL,
			"created_by_user_id" text NOT NULL,
			"updated_by_user_id" text NOT NULL,
			"created_at" timestamp with time zone DEFAULT now() NOT NULL,
			"updated_at" timestamp with time zone DEFAULT now() NOT NULL
		);
		ALTER TABLE "space_canvas_states" ADD CONSTRAINT "space_canvas_states_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "space_canvas_states" ADD CONSTRAINT "space_canvas_states_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
		ALTER TABLE "space_canvas_states" ADD CONSTRAINT "space_canvas_states_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END
$$;
