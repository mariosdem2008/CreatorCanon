ALTER TABLE "hub" ALTER COLUMN "template_key" SET DEFAULT 'editorial_atlas';
UPDATE "hub" SET "template_key" = 'editorial_atlas' WHERE "template_key" = 'legacy_v0';
