/**
 * One-off operator helper: inspect existing workspaces, channels, and projects.
 * Used to pick the right workspace/channel for ad-hoc seeding tasks.
 */
import { closeDb, getDb, sql } from '@creatorcanon/db';
import { workspace, channel, project, workspaceMember } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const db = getDb();
  const wsRows = await db
    .select({ id: workspace.id, name: workspace.name })
    .from(workspace)
    .limit(20);
  console.log('workspaces:', wsRows);
  for (const w of wsRows) {
    const chRows = await db
      .select({ id: channel.id, title: channel.title })
      .from(channel)
      .where(sql`workspace_id = ${w.id}`)
      .limit(10);
    console.log(`  ws=${w.id} channels:`, chRows);
    const projRows = await db
      .select({ id: project.id, title: project.title })
      .from(project)
      .where(sql`workspace_id = ${w.id}`)
      .limit(20);
    console.log(`  ws=${w.id} projects:`, projRows);
    const memberRows = await db
      .select({ userId: workspaceMember.userId })
      .from(workspaceMember)
      .where(sql`workspace_id = ${w.id}`)
      .limit(5);
    console.log(`  ws=${w.id} members:`, memberRows);
  }
  await closeDb();
}

main().catch(async (e) => {
  await closeDb();
  console.error(e);
  process.exit(1);
});
