ALTER TABLE "hub" ALTER COLUMN "template_key" DROP DEFAULT;

CREATE TYPE "hub_template_key_new" AS ENUM ('creator_manual');

ALTER TABLE "hub"
ALTER COLUMN "template_key"
TYPE "hub_template_key_new"
USING 'creator_manual'::"hub_template_key_new";

DROP TYPE "hub_template_key";
ALTER TYPE "hub_template_key_new" RENAME TO "hub_template_key";

ALTER TABLE "hub" ALTER COLUMN "template_key" SET DEFAULT 'creator_manual';
