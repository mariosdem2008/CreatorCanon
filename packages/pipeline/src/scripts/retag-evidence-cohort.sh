#!/usr/bin/env bash
# Re-tag evidence registries for the 4 new creators that had partial coverage.
# Runs sequentially to avoid Codex rate-limit contention.
set -e
set -o pipefail

cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/phase-8-audit-lift/packages/pipeline"

LOG_DIR=/tmp/retag-evidence
mkdir -p $LOG_DIR

declare -A CREATORS=(
  [Sivers]=ad22df26-2b7f-4387-bcb3-19f0d9a06246
  [Clouse]=a9c221d4-a482-4bc3-8e63-3aca0af05a5b
  [Huber]=10c7b35f-7f57-43ed-ae70-fac3e5cd4581
  [Norton]=febba548-0056-412f-a3de-e100a7795aba
)

for name in Sivers Clouse Huber Norton; do
  rid="${CREATORS[$name]}"
  echo "[retag] === $name ($rid) starting at $(date) ==="
  PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts $rid --regen-evidence 2>&1 | tee $LOG_DIR/$name.log
  echo "[retag] === $name DONE at $(date) ==="
done

echo "[retag] all 4 creators retagged at $(date)"

# Re-run cohort report with fresh evidence
echo "[retag] re-running cohort report..."
npx tsx ./src/scripts/v2-cohort-report.ts \
  a8a05629-d400-4f71-a231-99614615521c \
  cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce \
  037458ae-1439-4e56-a8da-aa967f2f5e1b \
  ad22df26-2b7f-4387-bcb3-19f0d9a06246 \
  a9c221d4-a482-4bc3-8e63-3aca0af05a5b \
  10c7b35f-7f57-43ed-ae70-fac3e5cd4581 \
  febba548-0056-412f-a3de-e100a7795aba 2>&1 | tee $LOG_DIR/cohort-report-final.log

echo "[retag] ALL DONE at $(date)"
