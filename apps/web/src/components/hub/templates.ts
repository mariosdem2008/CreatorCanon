export type HubTemplateId = 'paper' | 'midnight' | 'field';

export interface HubTemplate {
  id: HubTemplateId;
  name: string;
  tagline: string;
  description: string;
  previewLabel: string;
  configureClassName: string;
  shellClassName: string;
  heroClassName: string;
  cardClassName: string;
  mutedTextClassName: string;
  accentTextClassName: string;
  buttonClassName: string;
  evidenceVariant: 'paper' | 'midnight' | 'field';
}

export const HUB_TEMPLATES: Record<HubTemplateId, HubTemplate> = {
  paper: {
    id: 'paper',
    name: 'Creator Manual',
    tagline: 'A refined reference hub for thoughtful creator archives.',
    description: 'Light, structured, and index-driven. Best for essays, frameworks, and evergreen learning libraries.',
    previewLabel: 'Creator manual',
    configureClassName: 'border-rule bg-paper text-ink has-[:checked]:border-amber has-[:checked]:bg-amber/5',
    shellClassName: 'bg-paper-studio text-ink',
    heroClassName: 'border-b border-rule-dark bg-paper',
    cardClassName: 'border border-rule bg-paper',
    mutedTextClassName: 'text-ink-4',
    accentTextClassName: 'text-amber-ink',
    buttonClassName: 'bg-ink text-paper hover:opacity-90',
    evidenceVariant: 'paper',
  },
  midnight: {
    id: 'midnight',
    name: 'Operator Manual',
    tagline: 'A tactical dark-mode operating system for actionable lessons.',
    description: 'Dense, high-contrast, and command-center oriented. Best for strategy, operations, and practical playbooks.',
    previewLabel: 'Operator manual',
    configureClassName: 'border-ink bg-ink text-paper has-[:checked]:border-amber has-[:checked]:bg-ink',
    shellClassName: 'bg-[#070b10] text-[#eef5ef]',
    heroClassName: 'border-b border-[#263240] bg-[radial-gradient(circle_at_top_left,#1b3530,#070b10_50%)]',
    cardClassName: 'border border-[#263240] bg-[#0f151c]',
    mutedTextClassName: 'text-[#7e9188]',
    // Slightly desaturated from #d7ff70 to #c8ef60 for WCAG AA on dark bg.
    accentTextClassName: 'text-[#c8ef60]',
    buttonClassName: 'bg-[#c8ef60] text-[#07100d] font-semibold hover:opacity-90 transition-opacity duration-150',
    evidenceVariant: 'midnight',
  },
  field: {
    id: 'field',
    name: 'Studio Manual',
    tagline: 'A warm source-forward archive for creator knowledge collections.',
    description: 'Vault-like, tactile, and library-inspired. Best for content collections, workshops, and studio archives.',
    previewLabel: 'Studio manual',
    configureClassName: 'border-[#c9b990] bg-[#f2e8cf] text-[#2f271b] has-[:checked]:border-[#7a4e22] has-[:checked]:bg-[#ead9b0]',
    shellClassName: 'bg-[#f2e8cf] text-[#2f271b]',
    heroClassName: 'border-b border-[#c9b990] bg-[linear-gradient(135deg,#fdf7e8,#e8d6a8)]',
    cardClassName: 'border border-[#c9b990] bg-[#fdf7e8]',
    mutedTextClassName: 'text-[#6e5f45]',
    accentTextClassName: 'text-[#7a4e22]',
    buttonClassName: 'bg-[#2f271b] text-[#fdf7e8] hover:opacity-85 transition-opacity duration-150',
    evidenceVariant: 'field',
  },
};

export function normalizeHubTemplateId(value: unknown): HubTemplateId {
  if (value === 'midnight' || value === 'playbook') return 'midnight';
  if (value === 'field' || value === 'guided') return 'field';
  return 'paper';
}

export function getHubTemplate(value: unknown): HubTemplate {
  return HUB_TEMPLATES[normalizeHubTemplateId(value)];
}

export const HUB_TEMPLATE_OPTIONS = [
  HUB_TEMPLATES.paper,
  HUB_TEMPLATES.midnight,
  HUB_TEMPLATES.field,
] as const;
