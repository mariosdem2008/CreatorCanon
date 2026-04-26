import { z } from 'zod';
import { ALLOWED_CONTENT_TYPES, MAX_FILE_BYTES } from '../../../../lib/uploads/contentTypes';

export const initBody = z.object({
  filename: z.string().min(1).max(256),
  fileSize: z.number().int().positive().max(MAX_FILE_BYTES),
  contentType: z.string().refine(
    (ct) => (ALLOWED_CONTENT_TYPES as Set<string>).has(ct),
    'Unsupported content type',
  ),
  workspaceId: z.string().min(1).optional(),
  durationSec: z.number().int().nonnegative().optional(),
});

export type InitBody = z.infer<typeof initBody>;
