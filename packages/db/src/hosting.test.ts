import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getTableColumns, getTableName } from 'drizzle-orm';

import { deployment } from './schema/hosting';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('deployment schema exposes Phase G hosting fields', () => {
  assert.equal(getTableName(deployment), 'deployment');

  const columns = getTableColumns(deployment);
  assert.equal(columns.id.name, 'id');
  assert.equal(columns.hubId.name, 'hub_id');
  assert.equal(columns.vercelProjectId.name, 'vercel_project_id');
  assert.equal(columns.vercelDeploymentId.name, 'vercel_deployment_id');
  assert.equal(columns.status.name, 'status');
  assert.equal(columns.liveUrl.name, 'live_url');
  assert.equal(columns.customDomain.name, 'custom_domain');
  assert.equal(columns.domainVerified.name, 'domain_verified');
  assert.equal(columns.sslReady.name, 'ssl_ready');
});

test('Phase G migration creates the deployment table', () => {
  const migrationPath = path.resolve(__dirname, '../drizzle/out/0022_phase_g_hosting.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migrationSql, /CREATE TYPE "public"\."deployment_status"/);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "deployment"/);
  assert.match(migrationSql, /"hub_id" text NOT NULL/);
  assert.match(migrationSql, /"vercel_project_id" varchar\(64\)/);
  assert.match(migrationSql, /"status" "deployment_status" DEFAULT 'pending' NOT NULL/);
  assert.match(migrationSql, /"domain_verified" boolean DEFAULT false/);
  assert.match(migrationSql, /"ssl_ready" boolean DEFAULT false/);
  assert.match(migrationSql, /CREATE UNIQUE INDEX IF NOT EXISTS "deployment_custom_domain_unique"/);
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION deployment_custom_domain_matches_hub/);
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION sync_deployment_custom_domain_from_hub/);
  assert.match(migrationSql, /CREATE TRIGGER deployment_custom_domain_matches_hub_trigger/);
  assert.match(migrationSql, /CREATE TRIGGER hub_custom_domain_sync_deployment_trigger/);
  assert.doesNotMatch(
    migrationSql,
    /IF NEW\."custom_domain" IS NULL THEN\s+RETURN NEW;/,
  );
  assert.match(migrationSql, /NEW\."custom_domain" := hub_domain/);
  assert.match(migrationSql, /hub_domain IS DISTINCT FROM NEW\."custom_domain"/);
});
