import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { vector } from './_vector';
import {
  actionabilityEnum,
  atomTypeEnum,
  confidenceEnum,
  knowledgeEdgeKindEnum,
  modalityEnum,
} from './enums';
import { workspace } from './workspace';
import { generationRun } from './run';

/**
 * `evidence_atom` — the unit of truth. Supports text, visual, and multimodal atoms.
 *
 * Constraints added in post-migration SQL:
 *   -- ALTER TABLE evidence_atom
 *   --   ADD CONSTRAINT evidence_atom_source_refs_nonempty
 *   --     CHECK (jsonb_array_length(source_refs) >= 1);
 *
 * HNSW index to be added in post-migration SQL:
 *   -- CREATE INDEX evidence_atom_embedding_hnsw ON evidence_atom
 *   --   USING hnsw (embedding vector_cosine_ops);
 */
export const evidenceAtom = pgTable(
  'evidence_atom',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    type: atomTypeEnum('type').notNull(),
    modality: modalityEnum('modality').notNull().default('text'),
    title: text('title').notNull(),
    statement: text('statement').notNull(),
    actionability: actionabilityEnum('actionability'),
    confidence: confidenceEnum('confidence').notNull().default('moderate'),
    /**
     * Array of {video_id, segment_id?, frame_observation_id?, start_ms, end_ms,
     * supporting_quote?, visual_ref?}. At least one ref required.
     */
    sourceRefs: jsonb('source_refs')
      .$type<
        Array<{
          video_id: string;
          segment_id?: string;
          frame_observation_id?: string;
          start_ms: number;
          end_ms: number;
          supporting_quote?: string;
          visual_ref?: string;
        }>
      >()
      .notNull(),
    /** HNSW index to be added in post-migration SQL (see comment above). */
    embedding: vector('embedding', { dimensions: 1536 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runIdx: index('evidence_atom_run_idx').on(t.runId),
    runTypeIdx: index('evidence_atom_run_type_idx').on(t.runId, t.type),
    runModalityIdx: index('evidence_atom_run_modality_idx').on(t.runId, t.modality),
    workspaceIdx: index('evidence_atom_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * `knowledge_edge` — atom relationships for cross-links, contradiction flags,
 * visual supports, and screen/slide progression.
 */
export const knowledgeEdge = pgTable(
  'knowledge_edge',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    fromAtomId: text('from_atom_id')
      .notNull()
      .references(() => evidenceAtom.id, { onDelete: 'cascade' }),
    toAtomId: text('to_atom_id')
      .notNull()
      .references(() => evidenceAtom.id, { onDelete: 'cascade' }),
    kind: knowledgeEdgeKindEnum('kind').notNull(),
    confidence: doublePrecision('confidence').notNull().default(0.5),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runKindIdx: index('knowledge_edge_run_kind_idx').on(t.runId, t.kind),
    fromIdx: index('knowledge_edge_from_idx').on(t.fromAtomId),
    toIdx: index('knowledge_edge_to_idx').on(t.toAtomId),
  }),
);
