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
    name: 'Editorial Atlas',
    tagline: 'A refined reference hub for thoughtful creator archives.',
    description: 'Light, editorial, and index-driven. Best for essays, frameworks, and evergreen learning libraries.',
    previewLabel: 'Reference atlas',
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
    name: 'Playbook OS',
    tagline: 'A tactical dark-mode operating system for actionable lessons.',
    description: 'Dense, high-contrast, and command-center oriented. Best for strategy, operations, and practical playbooks.',
    previewLabel: 'Operator playbook',
    configureClassName: 'border-ink bg-ink text-paper has-[:checked]:border-amber has-[:checked]:bg-ink',
    shellClassName: 'bg-[#090d12] text-[#eef5ef]',
    heroClassName: 'border-b border-[#283241] bg-[radial-gradient(circle_at_top_left,#1f3b35,#090d12_48%)]',
    cardClassName: 'border border-[#283241] bg-[#10161d]',
    mutedTextClassName: 'text-[#94a39b]',
    accentTextClassName: 'text-[#d7ff70]',
    buttonClassName: 'bg-[#d7ff70] text-[#07100d] hover:opacity-90',
    evidenceVariant: 'midnight',
  },
  field: {
    id: 'field',
    name: 'Studio Vault',
    tagline: 'A warm source-forward archive for creator knowledge collections.',
    description: 'Vault-like, tactile, and library-inspired. Best for content collections, workshops, and studio archives.',
    previewLabel: 'Archive vault',
    configureClassName: 'border-[#cdbf9f] bg-[#fbf3df] text-[#2f271b] has-[:checked]:border-[#8e5c2c] has-[:checked]:bg-[#f5e3bd]',
    shellClassName: 'bg-[#f4ead3] text-[#2f271b]',
    heroClassName: 'border-b border-[#cdbf9f] bg-[linear-gradient(135deg,#fff8e7,#ead6ad)]',
    cardClassName: 'border border-[#cdbf9f] bg-[#fffaf0]',
    mutedTextClassName: 'text-[#76684f]',
    accentTextClassName: 'text-[#8e5c2c]',
    buttonClassName: 'bg-[#2f271b] text-[#fff8e7] hover:opacity-90',
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
