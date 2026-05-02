import { adaptArchiveToCreatorManual } from './creator-manual';
import type { AdapterFn } from './types';

export const ADAPTERS: Record<string, AdapterFn> = {
  creator_manual: adaptArchiveToCreatorManual,
};

export function getAdapter(templateKey: string): AdapterFn {
  const fn = ADAPTERS[templateKey];
  if (!fn) throw new Error(`No adapter registered for templateKey '${templateKey}'`);
  return fn;
}
