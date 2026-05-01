import type { ArtifactBundle, ArtifactKind, CriticOutput, PagePlan } from './types';
import { runProseAuthor, type ProseAuthorInput } from './specialists/prose';
import { runRoadmapAuthor, type RoadmapAuthorInput } from './specialists/roadmap';
import { runExampleAuthor, type ExampleAuthorInput } from './specialists/example';
import { runDiagramAuthor, type DiagramAuthorInput } from './specialists/diagram';
import { runMistakesAuthor, type MistakesAuthorInput } from './specialists/mistakes';
import type { SpecialistContext } from './specialists/_runner';

export interface ReviseInput {
  plan: PagePlan;
  artifacts: ArtifactBundle;
  notes: CriticOutput;
  // Per-specialist input builders, so callers can inject the same canon-nodes
  // / segment-excerpts / channel-profile they used for the first pass.
  proseInput: ProseAuthorInput;
  roadmapInput?: RoadmapAuthorInput;
  exampleInput?: ExampleAuthorInput;
  diagramInput?: DiagramAuthorInput;
  mistakesInput?: MistakesAuthorInput;
  contextByKind: (kind: ArtifactKind) => SpecialistContext;
}

/**
 * Re-author each artifact that has critic notes, using the same specialist
 * with an extended user message that includes the original artifact + the
 * notes for that artifact. Single-iteration: no second critic round.
 */
export async function runRevisePass(input: ReviseInput): Promise<ArtifactBundle> {
  const notesByKind = new Map<ArtifactKind, CriticOutput['notes']>();
  for (const n of input.notes.notes) {
    if (!notesByKind.has(n.artifactKind)) notesByKind.set(n.artifactKind, []);
    notesByKind.get(n.artifactKind)!.push(n);
  }

  const result: ArtifactBundle = {
    prose: input.artifacts.prose,
    workbenchArtifacts: input.artifacts.workbenchArtifacts,
  };

  if (notesByKind.has('cited_prose')) {
    const reviseInput: ProseAuthorInput = {
      ...input.proseInput,
      ctx: input.contextByKind('cited_prose'),
    };
    result.prose = await runProseAuthorWithNotes(reviseInput, notesByKind.get('cited_prose')!);
  }
  if (input.artifacts.roadmap) {
    result.roadmap = notesByKind.has('roadmap') && input.roadmapInput
      ? await runRoadmapAuthorWithNotes({ ...input.roadmapInput, ctx: input.contextByKind('roadmap') }, notesByKind.get('roadmap')!)
      : input.artifacts.roadmap;
  }
  if (input.artifacts.example) {
    result.example = notesByKind.has('hypothetical_example') && input.exampleInput
      ? await runExampleAuthorWithNotes({ ...input.exampleInput, ctx: input.contextByKind('hypothetical_example') }, notesByKind.get('hypothetical_example')!)
      : input.artifacts.example;
  }
  if (input.artifacts.diagram) {
    if (notesByKind.has('diagram') && input.diagramInput) {
      const revised = await runDiagramAuthorWithNotes(
        { ...input.diagramInput, ctx: input.contextByKind('diagram') },
        notesByKind.get('diagram')!,
      );
      result.diagram = revised ?? input.artifacts.diagram;
    } else {
      result.diagram = input.artifacts.diagram;
    }
  }
  if (input.artifacts.mistakes) {
    result.mistakes = notesByKind.has('common_mistakes') && input.mistakesInput
      ? await runMistakesAuthorWithNotes({ ...input.mistakesInput, ctx: input.contextByKind('common_mistakes') }, notesByKind.get('common_mistakes')!)
      : input.artifacts.mistakes;
  }
  return result;
}

// Each "*WithNotes" wrapper appends the critic's notes into the channel
// profile payload as a `_revisionNotes` field. The specialist's user-message
// template embeds the channel profile JSON, so the notes flow through to the
// LLM without changing each specialist's signature. The LLM picks them up as
// guidance even though the system prompt doesn't reference them by name.

async function runProseAuthorWithNotes(input: ProseAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runProseAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runRoadmapAuthorWithNotes(input: RoadmapAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runRoadmapAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runExampleAuthorWithNotes(input: ExampleAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runExampleAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runDiagramAuthorWithNotes(input: DiagramAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runDiagramAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runMistakesAuthorWithNotes(input: MistakesAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runMistakesAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}
