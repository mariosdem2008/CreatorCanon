import { createHash } from 'node:crypto';

import {
  PIPELINE_VERSION,
  type PipelineStage,
} from '@atlas/core/pipeline-stages';

export interface StageIdempotencyKeyInput {
  runId: string;
  stageName: PipelineStage;
  inputHash: string;
  pipelineVersion?: string;
}

export const stageIdempotencyKey = (input: StageIdempotencyKeyInput): string => {
  const version = input.pipelineVersion ?? PIPELINE_VERSION;
  return `${input.runId}:${input.stageName}:${input.inputHash}:${version}`;
};

export const hashInput = (value: unknown): string => {
  const canonical = JSON.stringify(value, Object.keys(value ?? {}).sort());
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
};
