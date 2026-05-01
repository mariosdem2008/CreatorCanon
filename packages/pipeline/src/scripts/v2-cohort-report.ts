// Usage: tsx ./src/scripts/v2-cohort-report.ts <runId-1> <runId-2> ... <runId-N>
//
// Aggregates v2-completeness-report data across N creators and emits a
// side-by-side comparison table. Used in Phase 8 to demonstrate that
// 7 creators × 4 archetypes all clear agency-premium bars.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM equivalent of __dirname — required because the package is "type": "module"
// and __dirname is not defined for ESM scripts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PerCreatorStatus {
  runId: string;
  creator: string;
  archetype: string;
  voiceMode: string;
  layersGreen: string;        // e.g. "7/7"
  verificationRate: string;   // e.g. "94%"
  workshopAvgRelevance: string;
  workshopHardFails: string;  // 0 or count
  thirdPersonLeaks: string;   // 0 or count
  voiceModeViolations: string;// 0 or count
}

async function main() {
  const runIds = process.argv.slice(2);
  if (runIds.length === 0) {
    throw new Error('Usage: tsx ./src/scripts/v2-cohort-report.ts <runId-1> ... <runId-N>');
  }

  const results: PerCreatorStatus[] = [];
  for (const runId of runIds) {
    console.info(`[cohort] processing ${runId}…`);
    // Run completeness + voice-mode + leak validators, capture outputs
    const completeness = spawnSync(
      'tsx', [path.join(__dirname, 'v2-completeness-report.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );
    const voiceMode = spawnSync(
      'tsx', [path.join(__dirname, 'check-voice-mode.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );
    const leak = spawnSync(
      'tsx', [path.join(__dirname, 'check-third-person-leak.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );
    const workshops = spawnSync(
      'tsx', [path.join(__dirname, 'validate-workshops.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );

    // Parse machine-readable METRIC lines emitted by each validator. The
    // validators print `[<tag>] METRIC <key>=<value>` lines for stable parsing.
    const all = [completeness.stdout, voiceMode.stdout, leak.stdout, workshops.stdout].join('\n');

    const metric = (key: string, fallback: string): string => {
      const re = new RegExp(`METRIC ${key}=(\\S+)`);
      const m = all.match(re);
      return m ? m[1]! : fallback;
    };

    results.push({
      runId,
      creator: metric('creator', '?'),
      archetype: metric('archetype', '?'),
      voiceMode: metric('voice_mode', '?'),
      layersGreen: metric('layers_green', '?'),
      verificationRate: metric('verification_rate', '?') + '%',
      workshopAvgRelevance: metric('workshop_avg_relevance', '?'),
      workshopHardFails: metric('workshop_hard_fails', '?'),
      thirdPersonLeaks: metric('third_person_leaks', '?'),
      voiceModeViolations: metric('voice_mode_violations', '?'),
    });
  }

  // Render comparison table
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`  v2 Cohort Report — ${runIds.length} creators`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  for (const r of results) {
    console.log(`  ${r.creator.padEnd(20)} ${r.archetype.padEnd(22)} ${r.voiceMode}`);
    console.log(`    layers:           ${r.layersGreen}`);
    console.log(`    verification:     ${r.verificationRate}`);
    console.log(`    workshop avg rel: ${r.workshopAvgRelevance}`);
    console.log(`    workshop fails:   ${r.workshopHardFails}`);
    console.log(`    3rd-person leaks: ${r.thirdPersonLeaks}`);
    console.log(`    voice-mode viols: ${r.voiceModeViolations}`);
    console.log('');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════');

  // Aggregate pass criteria
  const allGreen = results.every((r) =>
    r.layersGreen === '7/7' &&
    parseFloat(r.verificationRate) >= 95 &&
    parseFloat(r.workshopAvgRelevance) >= 90 &&
    r.workshopHardFails === '0' &&
    r.thirdPersonLeaks === '0' &&
    r.voiceModeViolations === '0',
  );
  console.log(`Aggregate: ${allGreen ? '✓ ALL CREATORS PASS AGENCY-PREMIUM BARS' : '✗ One or more creators fall short'}`);

  // Delta from Phase 7 baseline (verification rate was 84-90%; aggregate audit grade was 7.2/10).
  const verificationRates = results.map((r) => parseFloat(r.verificationRate));
  const avgVerification = verificationRates.reduce((a, b) => a + b, 0) / verificationRates.length;
  const phase7Baseline = 87;  // mean of Jordan 87 / Walker 84 / Hormozi 90 from Phase 7 results.
  const delta = avgVerification - phase7Baseline;
  console.log(`Verification rate: ${avgVerification.toFixed(1)}% (Phase 7 baseline: ${phase7Baseline}%, delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp)`);
  console.log('');
}

main().catch((err) => {
  console.error('[cohort] FAILED', err);
  process.exit(1);
});
