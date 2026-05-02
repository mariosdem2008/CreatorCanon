import { ArchiveAuditError } from './types';

export type ParsedYouTubeChannelInput =
  | { kind: 'handle'; value: string; originalUrl: string }
  | { kind: 'channelId'; value: string; originalUrl: string }
  | { kind: 'username'; value: string; originalUrl: string };

export function parseYouTubeChannelInput(rawInput: string): ParsedYouTubeChannelInput {
  const input = rawInput.trim();
  if (!input) throw new ArchiveAuditError('channel_url_required');

  if (input.startsWith('@')) {
    const value = input.slice(1).trim();
    if (!value) throw new ArchiveAuditError('channel_url_required');
    return { kind: 'handle', value, originalUrl: input };
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ArchiveAuditError('channel_url_unsupported');
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'm.youtube.com') {
    throw new ArchiveAuditError('channel_url_not_youtube');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const first = parts[0] ?? '';
  const second = parts[1] ?? '';

  if (first.startsWith('@')) return { kind: 'handle', value: first.slice(1), originalUrl: input };
  if (first === 'channel' && second)
    return { kind: 'channelId', value: second, originalUrl: input };
  if (first === 'user' && second) return { kind: 'username', value: second, originalUrl: input };

  throw new ArchiveAuditError('channel_url_unsupported');
}
