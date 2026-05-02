import type { Metadata } from 'next';

import { ArchiveAuditClient } from '@/components/marketing/archive-audit/ArchiveAuditClient';

export const metadata: Metadata = {
  title: 'Free YouTube Archive Audit | CreatorCanon',
  description:
    'Paste your YouTube channel URL and see what your archive could become as a source-cited CreatorCanon hub.',
};

export default function ArchiveAuditPage() {
  return <ArchiveAuditClient />;
}
