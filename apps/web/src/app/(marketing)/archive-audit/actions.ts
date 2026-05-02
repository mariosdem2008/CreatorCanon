'use server';

import { headers } from 'next/headers';
import { runArchiveAudit, isArchiveAuditError, type AuditReport } from '@creatorcanon/pipeline/audit';
import { z } from 'zod';

export type ArchiveAuditActionState =
  | { status: 'idle' }
  | { status: 'success'; auditId: string; report: AuditReport }
  | { status: 'error'; code: string; message: string };

const inputSchema = z.object({
  channelUrl: z.string().trim().min(3).max(300),
});

const FALLBACK_ERROR_COPY =
  'The archive scan worked, but the report could not be generated. Try again soon.';

const ERROR_COPY: Record<string, string> = {
  channel_url_required: 'Paste a YouTube channel URL or handle.',
  invalid_channel_url: 'Paste a YouTube channel URL or handle.',
  channel_url_not_youtube: 'Use a YouTube channel URL, such as https://www.youtube.com/@creator.',
  channel_url_unsupported: 'Use a public channel page, not a single video or playlist.',
  channel_not_found: 'CreatorCanon could not find that public channel.',
  no_public_videos: 'That channel does not show public videos yet.',
  archive_audit_config_missing: 'Archive audits are not configured on this deployment yet.',
  youtube_api_key_missing: 'Archive audits need a YouTube Data API key before public scans can run.',
  youtube_quota_exceeded:
    'YouTube is rate limiting public archive scans right now. Try again soon.',
  ai_quota_exceeded: 'Archive report generation is temporarily out of capacity. Try again soon.',
  daily_limit_reached: 'You have reached the free audit limit for today.',
  origin_not_allowed: 'Refresh this page and try again from CreatorCanon.',
  audit_generation_failed: FALLBACK_ERROR_COPY,
};

function errorCopy(code: string): string {
  return ERROR_COPY[code] ?? FALLBACK_ERROR_COPY;
}

function sameOriginFormPost(requestHeaders: ReturnType<typeof headers>): boolean {
  const origin = requestHeaders.get('origin');
  if (!origin) return true;

  const host = (requestHeaders.get('host') ?? requestHeaders.get('x-forwarded-host'))
    ?.split(',')[0]
    ?.trim();
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function runArchiveAuditAction(
  _previousState: ArchiveAuditActionState,
  formData: FormData,
): Promise<ArchiveAuditActionState> {
  const parsed = inputSchema.safeParse({
    channelUrl: formData.get('channelUrl'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      code: 'invalid_channel_url',
      message: errorCopy('invalid_channel_url'),
    };
  }

  try {
    const requestHeaders = headers();
    if (!sameOriginFormPost(requestHeaders)) {
      return {
        status: 'error',
        code: 'origin_not_allowed',
        message: errorCopy('origin_not_allowed'),
      };
    }

    const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
    const result = await runArchiveAudit({
      channelUrl: parsed.data.channelUrl,
      ipAddress: forwardedFor,
    });

    return { status: 'success', auditId: result.auditId, report: result.report };
  } catch (error) {
    if (isArchiveAuditError(error)) {
      return {
        status: 'error',
        code: error.code,
        message: errorCopy(error.code),
      };
    }

    return {
      status: 'error',
      code: 'audit_generation_failed',
      message: FALLBACK_ERROR_COPY,
    };
  }
}
