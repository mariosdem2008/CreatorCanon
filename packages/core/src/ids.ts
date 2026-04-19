import { randomUUID } from 'node:crypto';

export type IdPrefix =
  | 'ws'
  | 'usr'
  | 'prj'
  | 'run'
  | 'vid'
  | 'seg'
  | 'atom'
  | 'pg'
  | 'rel'
  | 'hub'
  | 'stg'
  | 'va'
  | 'fa'
  | 'fob';

export const newId = (prefix: IdPrefix): string => `${prefix}_${randomUUID()}`;
