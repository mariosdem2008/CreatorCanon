ALTER TABLE "hub" ALTER COLUMN "template_key" DROP DEFAULT;
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."hub_template_key_creator_manual_only";
--> statement-breakpoint
DO $$ BEGIN
 IF (
   EXISTS (
     SELECT 1
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'hub_template_key'
       AND e.enumlabel <> 'creator_manual'
   )
   OR NOT EXISTS (
     SELECT 1
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'hub_template_key'
       AND e.enumlabel = 'creator_manual'
   )
 ) THEN
   CREATE TYPE "public"."hub_template_key_creator_manual_only" AS ENUM ('creator_manual');
   ALTER TABLE "hub"
   ALTER COLUMN "template_key"
   TYPE "public"."hub_template_key_creator_manual_only"
   USING 'creator_manual'::"public"."hub_template_key_creator_manual_only";
   DROP TYPE "public"."hub_template_key";
   ALTER TYPE "public"."hub_template_key_creator_manual_only" RENAME TO "hub_template_key";
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "hub" ALTER COLUMN "template_key" SET DEFAULT 'creator_manual';
