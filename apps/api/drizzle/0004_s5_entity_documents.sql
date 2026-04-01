ALTER TABLE "documents" ADD COLUMN "entity_id" text;
--> statement-breakpoint
UPDATE "documents"
SET "entity_id" = 'document-entity-' || "id"
WHERE "entity_id" IS NULL;
--> statement-breakpoint
INSERT INTO "entities" (
	"id",
	"workspace_id",
	"space_id",
	"entity_type_id",
	"title",
	"summary",
	"properties",
	"created_by_user_id",
	"updated_by_user_id",
	"created_at",
	"updated_at"
)
SELECT
	"documents"."entity_id",
	"documents"."workspace_id",
	"documents"."space_id",
	(
		SELECT "entity_types"."id"
		FROM "entity_types"
		WHERE "entity_types"."workspace_id" = "documents"."workspace_id"
		  AND "entity_types"."slug" = 'note'
		LIMIT 1
	),
	"documents"."title",
	NULLIF("documents"."preview_text", ''),
	'{}'::jsonb,
	"documents"."created_by_user_id",
	"documents"."updated_by_user_id",
	"documents"."created_at",
	"documents"."updated_at"
FROM "documents"
LEFT JOIN "entities" ON "entities"."id" = "documents"."entity_id"
WHERE "entities"."id" IS NULL;
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "entity_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_entity_unique" UNIQUE("entity_id");
--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("entity_id");
