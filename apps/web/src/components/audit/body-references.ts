export type BodyReference =
  | { kind: 'segment'; id: string; token: string; index: number }
  | { kind: 'visualMoment'; id: string; token: string; index: number };

const UUID_SOURCE = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const VM_SOURCE = 'vm_[A-Za-z0-9_-]+';
const BODY_REFERENCE_REGEX = new RegExp(`\\[(?:(${UUID_SOURCE})|(?:VM:)?(${VM_SOURCE}))\\]`, 'gi');

export function parseBodyReferences(body: string): BodyReference[] {
  if (!body) return [];
  const refs: BodyReference[] = [];
  const re = new RegExp(BODY_REFERENCE_REGEX.source, BODY_REFERENCE_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const segmentId = match[1];
    const visualMomentId = match[2];
    if (segmentId) {
      refs.push({ kind: 'segment', id: segmentId, token: match[0], index: match.index });
    } else if (visualMomentId) {
      refs.push({ kind: 'visualMoment', id: visualMomentId, token: match[0], index: match.index });
    }
  }
  return refs;
}

export function formatVisualMomentTimestamp(timestampMs: number): string {
  const total = Math.max(0, Math.floor(timestampMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function buildVisualMomentYoutubeUrl(youtubeId: string | null | undefined, timestampMs: number): string | null {
  if (!youtubeId) return null;
  return `https://youtube.com/watch?v=${youtubeId}&t=${Math.max(0, Math.floor(timestampMs / 1000))}s`;
}
