'use client';

import { useState } from 'react';

export type EvidenceType =
  | 'claim' | 'framework_step' | 'example' | 'caveat'
  | 'mistake' | 'tool' | 'story' | 'proof';

export interface EvidenceEntry {
  segmentId: string;
  supportingPhrase: string;
  evidenceType: EvidenceType;
  supports: string;
  relevanceScore: number;
  confidence: 'high' | 'medium' | 'low';
  roleEvidence: string;
  whyThisSegmentFits: string;
  whyThisSegmentMayNotFit?: string;
  verificationStatus: 'verified' | 'needs_review' | 'unsupported';
}

const ROLE_COLORS: Record<EvidenceType, string> = {
  claim: 'bg-blue-100 text-blue-800',
  framework_step: 'bg-violet-100 text-violet-800',
  example: 'bg-emerald-100 text-emerald-800',
  caveat: 'bg-amber-100 text-amber-800',
  mistake: 'bg-rose-100 text-rose-800',
  tool: 'bg-cyan-100 text-cyan-800',
  story: 'bg-pink-100 text-pink-800',
  proof: 'bg-slate-100 text-slate-800',
};

const ROLE_ABBREV: Record<EvidenceType, string> = {
  claim: 'CLM',
  framework_step: 'STP',
  example: 'EX',
  caveat: 'CAV',
  mistake: 'MST',
  tool: 'TL',
  story: 'STR',
  proof: 'PRF',
};

interface EvidenceChipProps {
  segmentId: string;
  entry: EvidenceEntry;
  segment: { videoId: string; startMs: number; text?: string };
  youtubeId: string | null;
  debug: boolean;
}

export function EvidenceChip({ segmentId, entry, segment, youtubeId, debug }: EvidenceChipProps) {
  const [open, setOpen] = useState(false);

  // Hide unsupported entries unless debug mode
  if (entry.verificationStatus === 'unsupported' && !debug) return null;

  const startSec = Math.floor(segment.startMs / 1000);
  const youtubeUrl = youtubeId ? `https://youtube.com/watch?v=${youtubeId}&t=${startSec}s` : null;
  const roleColor = ROLE_COLORS[entry.evidenceType] ?? 'bg-slate-100 text-slate-800';
  const abbrev = ROLE_ABBREV[entry.evidenceType] ?? entry.evidenceType.slice(0, 3).toUpperCase();
  const isUnsupported = entry.verificationStatus === 'unsupported';
  const isNeedsReview = entry.verificationStatus === 'needs_review';

  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 mx-0.5 ${roleColor} ${isUnsupported ? 'opacity-50 line-through' : ''} ${isNeedsReview ? 'ring-1 ring-amber-400' : ''}`}
        aria-label={`Evidence: ${entry.evidenceType}, score ${entry.relevanceScore}`}
      >
        {abbrev} {entry.relevanceScore}
      </button>
      {open ? (
        <div
          className="absolute z-20 left-0 mt-1 w-[320px] rounded-md border border-[var(--cc-rule)] bg-white p-3 shadow-lg"
          role="dialog"
        >
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cc-ink)]">
              {entry.evidenceType.replace(/_/g, ' ')}
            </p>
            <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
              entry.confidence === 'high' ? 'bg-emerald-100 text-emerald-800' :
              entry.confidence === 'medium' ? 'bg-amber-100 text-amber-800' :
              'bg-slate-100 text-slate-600'
            }`}>
              {entry.confidence} · {entry.relevanceScore}/100
            </span>
          </div>
          <blockquote className="mt-2 border-l-2 border-[var(--cc-rule)] pl-2 text-[12px] italic text-[var(--cc-ink-2)]">
            &ldquo;{entry.supportingPhrase}&rdquo;
          </blockquote>
          <p className="mt-2 text-[11px] leading-[1.45] text-[var(--cc-ink-3)]">
            {entry.whyThisSegmentFits}
          </p>
          {youtubeUrl ? (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-[11px] font-semibold text-[var(--cc-accent)] hover:underline"
            >
              Watch on YouTube ↗
            </a>
          ) : null}
          {debug ? (
            <details className="mt-2 rounded border border-dashed border-[var(--cc-rule)] p-2">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-4)]">
                Operator detail
              </summary>
              <div className="mt-1 space-y-1 font-mono text-[10px] text-[var(--cc-ink-3)]">
                <p><strong>roleEvidence:</strong> {entry.roleEvidence}</p>
                {entry.whyThisSegmentMayNotFit ? (
                  <p><strong>mayNotFit:</strong> {entry.whyThisSegmentMayNotFit}</p>
                ) : null}
                <p><strong>verificationStatus:</strong> {entry.verificationStatus}</p>
                <p><strong>supports:</strong> {entry.supports}</p>
                <p><strong>segmentId:</strong> {segmentId}</p>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

// renderBodyWithChips moved to ./render-body-with-chips.tsx
// (server components can't call exports from a 'use client' module).
