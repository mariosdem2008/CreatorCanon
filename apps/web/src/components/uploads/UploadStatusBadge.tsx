import { StatusPill } from '@/components/cc';
import { resolveStatus } from './uploadStatusLogic';

export type { Props } from './uploadStatusLogic';

export { resolveStatus } from './uploadStatusLogic';

export function UploadStatusBadge(props: Parameters<typeof resolveStatus>[0]) {
  const { label, tone } = resolveStatus(props);
  return <StatusPill tone={tone}>{label}</StatusPill>;
}
