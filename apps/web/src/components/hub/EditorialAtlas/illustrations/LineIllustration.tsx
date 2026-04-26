// apps/web/src/components/hub/EditorialAtlas/illustrations/LineIllustration.tsx
import type { ReactNode } from 'react';

import { BooksIllustration } from './BooksIllustration';
import { DeskIllustration } from './DeskIllustration';
import { PlantIllustration } from './PlantIllustration';
import { OpenNotebookIllustration } from './OpenNotebookIllustration';

export type IllustrationKey = 'books' | 'desk' | 'plant' | 'open-notebook';

type Props = { illustrationKey: IllustrationKey; className?: string };

export function LineIllustration({ illustrationKey, className }: Props): ReactNode {
  switch (illustrationKey) {
    case 'books':         return <BooksIllustration className={className} />;
    case 'desk':          return <DeskIllustration className={className} />;
    case 'plant':         return <PlantIllustration className={className} />;
    case 'open-notebook': return <OpenNotebookIllustration className={className} />;
    default: {
      const _exhaustive: never = illustrationKey;
      void _exhaustive;
      return null;
    }
  }
}
