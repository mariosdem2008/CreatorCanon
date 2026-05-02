import type { AuditReport } from '@creatorcanon/pipeline/audit';

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Hub-ready archive';
  if (score >= 70) return 'Strong hub potential';
  if (score >= 50) return 'Promising but needs curation';
  return 'Needs a sharper source set';
}

export function severityLabel(severity: AuditReport['gaps'][number]['severity']): string {
  if (severity === 'high') return 'High priority';
  if (severity === 'medium') return 'Medium priority';
  return 'Low priority';
}

export function buildAuditCtaUrl(channelUrl: string): string {
  const params = new URLSearchParams({ source: 'archive-audit', channel: channelUrl });
  return `/request-access?${params.toString()}`;
}

export function buildAuditGeneratedProjectUrl(projectId: string): string {
  return `/app/projects/${projectId}`;
}

export function scoreTone(score: number): 'strong' | 'medium' | 'low' {
  if (score >= 75) return 'strong';
  if (score >= 50) return 'medium';
  return 'low';
}
