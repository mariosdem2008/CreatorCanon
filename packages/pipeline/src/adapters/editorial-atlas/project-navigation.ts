import { NAVIGATION_PRIMARY, NAVIGATION_SECONDARY, HIGHLIGHTS_NAV_ITEM } from './constants';

export function projectNavigation({ hasHighlights }: { hasHighlights: boolean }) {
  const primary = hasHighlights
    ? [...NAVIGATION_PRIMARY, HIGHLIGHTS_NAV_ITEM]
    : [...NAVIGATION_PRIMARY];
  return { primary, secondary: [...NAVIGATION_SECONDARY] };
}
