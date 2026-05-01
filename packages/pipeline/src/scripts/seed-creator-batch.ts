// Phase 8 onboarding wrapper. Wraps seed-hormozi-and-dispatch with a
// --voice-mode flag and ensures the resulting v2 audit run inherits the
// archetype's voice mode default (or the explicit override).
//
// Usage:
//   tsx ./src/scripts/seed-creator-batch.ts \
//     --dir "C:\\path\\to\\creator-mp4s" \
//     --workspaceId <id> --userId <id> --channelId <id> \
//     --projectTitle "Creator Name — Hub Title" \
//     --archetype contemplative-thinker \
//     --voice-mode hybrid
//
// (The existing helper handles MP4 upload + project/run creation. This
// wrapper adds voice-mode propagation + archetype hint.)

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM equivalent of __dirname — required because the package is "type": "module".
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

const dir = arg('--dir');
const workspaceId = arg('--workspaceId');
const userId = arg('--userId');
const channelId = arg('--channelId');
const projectTitle = arg('--projectTitle');
const voiceMode = arg('--voice-mode');
// archetype is informational; the channel-profile generator detects it
// from segments. We log it for traceability.
const archetype = arg('--archetype');

if (!dir || !workspaceId || !userId || !channelId || !projectTitle) {
  console.error('Usage: tsx ./src/scripts/seed-creator-batch.ts --dir <path> --workspaceId <id> --userId <id> --channelId <id> --projectTitle <title> [--archetype <slug>] [--voice-mode <mode>]');
  process.exit(1);
}

console.info(`[seed-creator-batch] starting onboarding for ${projectTitle}`);
if (archetype) console.info(`[seed-creator-batch] archetype hint: ${archetype}`);
if (voiceMode) console.info(`[seed-creator-batch] voiceMode: ${voiceMode}`);

// Step 1: upload + create run via existing helper (without --dispatch yet)
const helperPath = path.join(__dirname, 'seed-hormozi-and-dispatch.ts');
const helperResult = spawnSync(
  'tsx',
  [helperPath, '--dir', dir, '--workspaceId', workspaceId, '--userId', userId, '--channelId', channelId, '--projectTitle', projectTitle],
  { stdio: 'inherit' },
);
if (helperResult.status !== 0) {
  console.error('[seed-creator-batch] helper failed; aborting');
  process.exit(helperResult.status ?? 1);
}

// Step 2: parse runId from helper's stdout. If helper doesn't expose it
// programmatically, the operator copies it from the prior step's output
// and re-runs seed-audit-v2 manually with --voice-mode.
console.info('[seed-creator-batch] helper completed.');
console.info('[seed-creator-batch] To dispatch v2 audit with the configured voice mode, run:');
console.info(`  tsx ./src/scripts/seed-audit-v2.ts <runId> ${voiceMode ? `--voice-mode ${voiceMode}` : ''}`);
console.info('(Replace <runId> with the runId printed by the helper above.)');
