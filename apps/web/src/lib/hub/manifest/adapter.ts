// apps/web/src/lib/hub/manifest/adapter.ts
//
// Pipeline → EditorialAtlasManifest adapter.
//
// NOT IMPLEMENTED IN THIS SESSION.
//
// Maps the existing pipeline release output (release_manifest_v0 +
// draft_pages_v0 + source/transcript artifacts in `packages/pipeline/src/`)
// to EditorialAtlasManifest. The template is the contract; the pipeline is
// wired to emit this contract in a separate, later session — see the
// follow-up spec file `docs/superpowers/specs/<TBD>-pipeline-adapter.md`
// (created by the next brainstorming pass).
//
// Until then, the public hub route uses
// `apps/web/src/lib/hub/manifest/mockManifest.ts`.

import type { EditorialAtlasManifest } from './schema';

export function buildEditorialAtlasManifestFromRelease(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _input: never,
): EditorialAtlasManifest {
  throw new Error(
    'buildEditorialAtlasManifestFromRelease: not implemented yet — see docs/superpowers/specs/2026-04-25-editorial-atlas-hub-design.md § 5.7',
  );
}
