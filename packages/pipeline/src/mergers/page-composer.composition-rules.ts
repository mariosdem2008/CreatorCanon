import type { ArchiveFinding, ArchiveRelation } from '@creatorcanon/db/schema';

export type PageType = 'lesson' | 'framework' | 'playbook';

export interface ComposeContext {
  primary: ArchiveFinding;
  related: ArchiveFinding[];
  relations: ArchiveRelation[];
}

type SectionRuleFn = (ctx: ComposeContext) => Record<string, unknown> | null;

interface PageRule { pageType: PageType; sections: SectionRuleFn[]; }

export const COMPOSITION_RULES: Record<PageType, PageRule> = {
  lesson: {
    pageType: 'lesson',
    sections: [
      (ctx) => ({ kind: 'overview', body: (ctx.primary.payload as any).summary }),
      (ctx) => ({ kind: 'paragraph', body: (ctx.primary.payload as any).idea }),
      (ctx) => {
        const aha = ctx.related.find((r) => r.type === 'aha_moment');
        return aha ? { kind: 'quote', text: (aha.payload as any).quote, attribution: (aha.payload as any).attribution } : null;
      },
      (ctx) => {
        const q = ctx.related.find((r) => r.type === 'quote');
        return q ? { kind: 'quote', text: (q.payload as any).text, attribution: (q.payload as any).attribution } : null;
      },
    ],
  },
  framework: {
    pageType: 'framework',
    sections: [
      (ctx) => ({ kind: 'overview', body: (ctx.primary.payload as any).summary }),
      (ctx) => ({ kind: 'principles', items: (ctx.primary.payload as any).principles }),
      (ctx) => {
        const steps = (ctx.primary.payload as any).steps;
        return steps && steps.length > 0 ? { kind: 'steps', items: steps } : null;
      },
      (ctx) => {
        const contra = ctx.relations.filter((r) => r.type === 'contradicts');
        return contra.length > 0 ? { kind: 'common_mistakes', items: contra.map((c) => ({ title: 'Avoid', body: c.notes ?? 'See related finding' })) } : null;
      },
      (ctx) => ctx.primary.evidenceQuality === 'strong' ? null : { kind: 'callout', tone: 'note', body: 'This framework draws on limited evidence; treat as exploratory.' },
    ],
  },
  playbook: {
    pageType: 'playbook',
    sections: [
      (ctx) => ({ kind: 'overview', body: (ctx.primary.payload as any).summary }),
      (ctx) => ({ kind: 'principles', items: (ctx.primary.payload as any).principles }),
      (ctx) => {
        const scenes = (ctx.primary.payload as any).scenes;
        return scenes && scenes.length > 0 ? { kind: 'scenes', items: scenes } : null;
      },
      (ctx) => {
        const wf = (ctx.primary.payload as any).workflow;
        return wf && wf.length > 0 ? { kind: 'workflow', items: wf } : null;
      },
      (ctx) => {
        const fp = (ctx.primary.payload as any).failurePoints;
        return fp && fp.length > 0 ? { kind: 'failure_points', items: fp } : null;
      },
    ],
  },
};

export function findingTypeToPageType(t: string): PageType | null {
  return (t === 'lesson' || t === 'framework' || t === 'playbook') ? t : null;
}
