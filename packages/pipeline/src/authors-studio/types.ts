/**
 * Shared types for the Author's Studio. The Strategist plans the page; the
 * specialists author one artifact each; the critic reads everything and
 * proposes revisions; the assembler stitches the final blockTreeJson.
 */

export type VoiceMode = 'creator_first_person' | 'reader_second_person';

export type ReaderJob = 'learn' | 'build' | 'copy' | 'decide' | 'debug';

export type WorkbenchArtifactType = 'prompt' | 'checklist' | 'workflow' | 'template' | 'schema' | 'mistake_map';

export interface WorkbenchArtifactDraft {
  type: WorkbenchArtifactType;
  title: string;
  body: string;
  citationIds: string[];
}

export interface PageWorkbenchPlan {
  readerJob: ReaderJob;
  outcome: string;
  useWhen: string[];
  artifactRequests: Array<{
    type: WorkbenchArtifactType;
    title: string;
    intent: string;
    canonNodeIds: string[];
  }>;
  nextStepHints: Array<{
    title: string;
    reason: string;
  }>;
}

export type ArtifactKind = 'cited_prose' | 'roadmap' | 'hypothetical_example' | 'diagram' | 'common_mistakes';

export interface PagePlan {
  pageId: string;                     // brief id (used as page-plan id)
  pageType: string;                   // lesson | framework | playbook | topic_overview | etc.
  pageTitle: string;
  thesis: string;                     // 1-2 sentence editorial thesis
  arc: Array<{
    beat: string;                     // 1-line beat description
    canonNodeIds: string[];           // canon nodes anchoring this beat
  }>;
  voiceMode: VoiceMode;
  voiceNotes: {
    tone: 'analytical' | 'practitioner' | 'urgent' | 'generous';
    creatorTermsToUse: string[];      // 3-5 items lifted from creatorTerminology
    avoidPhrases: string[];           // generic phrases to avoid
  };
  artifacts: Array<{
    kind: ArtifactKind;
    canonNodeIds: string[];           // which canon nodes feed this artifact
    intent: string;                   // 1 sentence: what THIS artifact contributes
  }>;
  siblingPagesToReference: Array<{ pageId: string; title: string; slug: string }>;
  workbench: PageWorkbenchPlan;
  costCents: number;
}

export interface ProseArtifact {
  kind: 'cited_prose';
  paragraphs: Array<{ heading?: string; body: string; citationIds: string[] }>;
  summaryBullets?: string[];
  costCents: number;
}

export interface RoadmapArtifact {
  kind: 'roadmap';
  title: string;
  steps: Array<{
    index: number;
    title: string;
    body: string;
    durationLabel?: string;
    citationIds: string[];
  }>;
  costCents: number;
}

export interface ExampleArtifact {
  kind: 'hypothetical_example';
  setup: string;
  stepsTaken: string[];
  outcome: string;
  citationIds: string[];
  costCents: number;
}

export interface DiagramArtifact {
  kind: 'diagram';
  diagramType: 'flowchart' | 'sequence' | 'state' | 'mindmap';
  mermaidSrc: string;
  caption: string;
  citationIds: string[];
  costCents: number;
}

export interface MistakesArtifact {
  kind: 'common_mistakes';
  items: Array<{
    mistake: string;
    why: string;
    correction: string;
    citationIds: string[];
  }>;
  costCents: number;
}

export type SpecialistArtifact = ProseArtifact | RoadmapArtifact | ExampleArtifact | DiagramArtifact | MistakesArtifact;

export interface ArtifactBundle {
  prose: ProseArtifact;
  roadmap?: RoadmapArtifact;
  example?: ExampleArtifact;
  diagram?: DiagramArtifact;
  mistakes?: MistakesArtifact;
  workbenchArtifacts?: WorkbenchArtifactDraft[];
}

export interface RevisionNote {
  artifactKind: ArtifactKind;
  severity: 'critical' | 'important' | 'minor';
  issue: string;                      // 1 sentence
  evidence: string;                   // the offending text or reference
  prescription: string;               // concrete fix
}

export interface CriticOutput {
  notes: RevisionNote[];
  approved: boolean;                  // true when no critical notes
  costCents: number;
}
