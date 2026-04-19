// Trigger.dev task registry.
//
// Ticket 0.9 ships the `helloTask` smoke test. Epic 5 tickets add one task
// per pipeline stage; each stage task follows the id = stage-name convention
// so idempotency keys in @atlas/pipeline line up 1:1 with task ids.
//
// TODO — pipeline stage tasks (tracked against PIPELINE_STAGES in
// packages/core/src/pipeline-stages.ts):
//   1.  channel_metadata_scan         (Epic 3.x   — inventory-time)
//   2.  import_selection_snapshot     (Epic 4.x)
//   3.  ensure_transcripts            (Epic 5.1)
//   4.  ensure_visual_assets          (Epic 5.3v)
//   5.  normalize_transcripts         (Epic 5.2)
//   6.  segment_transcripts           (Epic 5.4)
//   7.  extract_text_atoms            (Epic 5.6)
//   8.  extract_visual_observations   (Epic 5.6v)
//   9.  merge_multimodal_atoms        (Epic 5.7m)
//   10. synthesize_videos             (Epic 5.7)
//   11. cluster_archive               (Epic 5.8)
//   12. build_outline                 (Epic 5.9)
//   13. draft_pages                   (Epic 5.10)
//   14. qa_and_repair                 (Epic 5.11)
//   15. index_chat                    (Epic 5.12)
//   16. build_release                 (Epic 5.13)
//
// Publishing a release (Epic 8.4) is a user action, not a pipeline stage.

export { helloTask } from './hello';
