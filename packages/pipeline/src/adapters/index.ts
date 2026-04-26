import { adaptArchiveToEditorialAtlas } from './editorial-atlas';
import type { AdapterFn } from './types';

export const ADAPTERS: Record<string, AdapterFn> = {
  editorial_atlas: adaptArchiveToEditorialAtlas,
};

export function getAdapter(templateKey: string): AdapterFn {
  const fn = ADAPTERS[templateKey];
  if (!fn) throw new Error(`No adapter registered for templateKey '${templateKey}'`);
  return fn;
}
