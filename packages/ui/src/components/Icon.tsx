import * as React from 'react';

export type IconName =
  | 'atlas'
  | 'compass'
  | 'book'
  | 'library'
  | 'video'
  | 'play'
  | 'pause'
  | 'search'
  | 'sparkle'
  | 'chat'
  | 'settings'
  | 'chart'
  | 'home'
  | 'arrowRight'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'check'
  | 'x'
  | 'plus'
  | 'minus'
  | 'dots'
  | 'dotsH'
  | 'clock'
  | 'calendar'
  | 'youtube'
  | 'upload'
  | 'download'
  | 'share'
  | 'copy'
  | 'edit'
  | 'trash'
  | 'filter'
  | 'sort'
  | 'check2'
  | 'chevDown'
  | 'chevUp'
  | 'chevRight'
  | 'chevLeft'
  | 'eye'
  | 'lock'
  | 'user'
  | 'users'
  | 'bell'
  | 'tag'
  | 'folder'
  | 'grid'
  | 'list'
  | 'link'
  | 'info'
  | 'warning'
  | 'zap'
  | 'globe'
  | 'logout'
  | 'credit'
  | 'refresh'
  | 'bookmark'
  | 'heart'
  | 'star'
  | 'mic'
  | 'send'
  | 'signal'
  | 'menu'
  | 'filterLines'
  | 'command'
  | 'file'
  | 'question'
  | 'external'
  | 'flask'
  | 'quote'
  | 'bulb'
  | 'tree'
  | 'diamond'
  | 'layers'
  | 'target';

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  atlas: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5L13 13l-4.5 2.5L11 11z" />
    </>
  ),
  book: (
    <>
      <path d="M4 4v16a2 2 0 0 1 2-2h14V4a1 1 0 0 0-1-1H6a2 2 0 0 0-2 2z" />
      <path d="M4 18a2 2 0 0 1 2 2h14" />
    </>
  ),
  library: (
    <>
      <path d="M5 3v18" />
      <path d="M9 3v18" />
      <path d="M13 5l3 15" />
      <path d="M19 3v18" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="5" width="16" height="14" rx="2" />
      <path d="M22 8v8l-4-3v-2z" />
    </>
  ),
  play: <path d="M8 5l11 7l-11 7z" />,
  pause: (
    <>
      <rect x="7" y="5" width="3" height="14" rx="1" />
      <rect x="14" y="5" width="3" height="14" rx="1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5l4 4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.4l5.4 1.8l-5.4 1.8l-1.8 5.4l-1.8-5.4l-5.4-1.8l5.4-1.8z" />
      <path d="M19 15l.8 2.2l2.2.8l-2.2.8l-.8 2.2l-.8-2.2l-2.2-.8l2.2-.8z" />
    </>
  ),
  chat: <path d="M21 12a8 8 0 0 1-8 8l-4 2v-4a8 8 0 1 1 12-6z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  chart: (
    <>
      <path d="M3 20h18" />
      <path d="M7 16v-5" />
      <path d="M12 16v-9" />
      <path d="M17 16v-3" />
    </>
  ),
  home: <path d="M3 11l9-7l9 7v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />,
  arrowRight: <path d="M5 12h14m-5-5l5 5l-5 5" />,
  arrowLeft: <path d="M19 12H5m5 5l-5-5l5-5" />,
  arrowUp: <path d="M12 19V5m-5 5l5-5l5 5" />,
  arrowDown: <path d="M12 5v14m-5-5l5 5l5-5" />,
  check: <path d="M4 12l5 5L20 6" />,
  x: <path d="M6 6l12 12M6 18L18 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  dots: (
    <>
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </>
  ),
  dotsH: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  youtube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M10 9l5 3l-5 3z" fill="currentColor" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-5 5l5-5l5 5" />
      <path d="M3 16v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12m-5-5l5 5l5-5" />
      <path d="M3 16v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 11l8-4M8 13l8 4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10l-4-4l-10 10z" />
      <path d="M14 6l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  filter: <path d="M3 5h18l-7 9v5l-4-2v-3z" />,
  sort: <path d="M3 6h10M3 12h7M3 18h4M14 8v12m0 0l-3-3m3 3l3-3" />,
  check2: <path d="M5 13l4 4L19 7" />,
  chevDown: <path d="M6 9l6 6l6-6" />,
  chevUp: <path d="M6 15l6-6l6 6" />,
  chevRight: <path d="M9 6l6 6l-6 6" />,
  chevLeft: <path d="M15 6l-6 6l6 6" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7s10 7 10 7s-3.5 7-10 7s-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20a7 7 0 0 1 14 0" />
      <path d="M16 4a3.5 3.5 0 0 1 0 7" />
      <path d="M17 13a6 6 0 0 1 5 7" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9l-9 9z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 1 0-5l3-3a4 4 0 0 1 5 5l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 1 0 5l-3 3a4 4 0 0 1-5-5l1.5-1.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v5h1" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  zap: <path d="M13 2L4 14h7l-1 8l9-12h-7z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5l-5-5M21 12H9" />
    </>
  ),
  credit: (
    <>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 11h20" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4l-6 4z" />,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  star: <path d="M12 3l2.6 5.8L21 10l-5 4.4L17.5 21L12 17.6L6.5 21L8 14.4L3 10l6.4-1.2z" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  send: <path d="M4 12l17-9l-5 18l-4-7z" />,
  signal: <path d="M4 20v-3M10 20v-7M16 20v-11M22 20v-15" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  filterLines: <path d="M4 6h16M7 12h10M10 18h4" />,
  command: (
    <path d="M6 9V7a2 2 0 1 1 2 2h-2zm0 0v6m0 0v2a2 2 0 1 1-2-2h2zm0 0h12m0 0V7a2 2 0 1 1 2 2h-2zm0 0v6m0 0h-12m12 0v2a2 2 0 1 1-2-2h2z" />
  ),
  file: (
    <>
      <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v6h6" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5L10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v7l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
      <path d="M7 15h10" />
    </>
  ),
  quote: (
    <>
      <path d="M7 7h4v4H7zM13 7h4v4h-4zM7 13c0 2 1 3 3 3M13 13c0 2 1 3 3 3" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10c1 1 1.5 2 1.5 3h5c0-1 .5-2 1.5-3a6 6 0 0 0-4-10z" />
    </>
  ),
  tree: (
    <>
      <path d="M6 3v18M6 8h4a2 2 0 0 1 2 2v2M6 14h7a2 2 0 0 1 2 2v2" />
      <circle cx="6" cy="3" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  diamond: <path d="M12 2l10 10l-10 10L2 12z" />,
  layers: (
    <>
      <path d="M12 3l9 5l-9 5l-9-5z" />
      <path d="M3 12l9 5l9-5" />
      <path d="M3 17l9 5l9-5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
}

export const Icon = ({ name, size = 16, stroke = 1.5, className, style, 'aria-label': ariaLabel }: IconProps) => {
  const paths = ICON_PATHS[name];
  if (!paths) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {paths}
    </svg>
  );
};
