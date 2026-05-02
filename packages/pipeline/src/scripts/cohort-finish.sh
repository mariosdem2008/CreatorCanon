#!/usr/bin/env bash
# Chained cohort finisher. Runs the rest of Task 8.13 sequentially after
# Clouse transcription completes. ONE background process, ONE notification.
#
# Order:
#   1. Wait for Clouse transcription to finish (sentinel: "All N transcriptions complete")
#   2. Huber transcription
#   3. Norton transcription
#   4. Clouse re-audit (real transcripts, first_person)
#   5. Huber re-audit (real transcripts, first_person)
#   6. Norton full audit (real transcripts, third_person_editorial)
#   7. cohort-validate-and-report across all 7 creators

set -e
set -o pipefail

cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/phase-8-audit-lift/packages/pipeline"

CLOUSE_RUN=a9c221d4-a482-4bc3-8e63-3aca0af05a5b
HUBER_RUN=10c7b35f-7f57-43ed-ae70-fac3e5cd4581
NORTON_RUN=febba548-0056-412f-a3de-e100a7795aba
SIVERS_RUN=ad22df26-2b7f-4387-bcb3-19f0d9a06246

JORDAN_RUN=a8a05629-d400-4f71-a231-99614615521c
WALKER_RUN=cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce
HORMOZI_RUN=037458ae-1439-4e56-a8da-aa967f2f5e1b

LOG_DIR=/tmp/cohort-finish
mkdir -p $LOG_DIR

echo "[cohort-finish] starting at $(date)"

# 1. Wait for Clouse transcription
echo "[cohort-finish] waiting for Clouse transcription to finish..."
until grep -q "All .* transcriptions complete" /tmp/transcribe-clouse-local.log 2>/dev/null; do
  sleep 30
done
echo "[cohort-finish] Clouse transcription DONE at $(date)"

# 2. Huber transcription
echo "[cohort-finish] === Huber transcription ==="
TRANSCRIBE_PROVIDER=local-whisper WHISPER_MODEL=small WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 \
  npx tsx ./src/scripts/transcribe-pending-uploads.ts $HUBER_RUN 2>&1 | tee $LOG_DIR/huber-transcribe.log
echo "[cohort-finish] Huber transcription DONE at $(date)"

# 3. Norton transcription
echo "[cohort-finish] === Norton transcription ==="
TRANSCRIBE_PROVIDER=local-whisper WHISPER_MODEL=small WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 \
  npx tsx ./src/scripts/transcribe-pending-uploads.ts $NORTON_RUN 2>&1 | tee $LOG_DIR/norton-transcribe.log
echo "[cohort-finish] Norton transcription DONE at $(date)"

# 4. Clouse re-audit (full from scratch, real transcripts)
echo "[cohort-finish] === Clouse re-audit ==="
PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts $CLOUSE_RUN \
  --regen-channel --regen-canon --regen-bodies --regen-evidence \
  --voice-mode first_person 2>&1 | tee $LOG_DIR/clouse-reaudit.log
echo "[cohort-finish] Clouse re-audit DONE at $(date)"

# 5. Huber re-audit
echo "[cohort-finish] === Huber re-audit ==="
PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts $HUBER_RUN \
  --regen-channel --regen-canon --regen-bodies --regen-evidence \
  --voice-mode first_person 2>&1 | tee $LOG_DIR/huber-reaudit.log
echo "[cohort-finish] Huber re-audit DONE at $(date)"

# 6. Norton full audit (first time with real transcripts)
echo "[cohort-finish] === Norton audit ==="
PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts $NORTON_RUN \
  --voice-mode third_person_editorial 2>&1 | tee $LOG_DIR/norton-audit.log
echo "[cohort-finish] Norton audit DONE at $(date)"

# 7. Cohort validate + report
echo "[cohort-finish] === cohort validators + report ==="
npx tsx ./src/scripts/cohort-validate-and-report.ts \
  $JORDAN_RUN $WALKER_RUN $HORMOZI_RUN \
  $SIVERS_RUN $CLOUSE_RUN $HUBER_RUN $NORTON_RUN 2>&1 | tee $LOG_DIR/cohort-report.log
echo "[cohort-finish] cohort report DONE at $(date)"

echo "[cohort-finish] ALL DONE at $(date)"
echo "[cohort-finish] logs in: $LOG_DIR"
