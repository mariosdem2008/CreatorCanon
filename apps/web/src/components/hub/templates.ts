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
    tagline: 'A precise reference hub for thoughtful creator archives.',
    description:
      'Dark, structured, and index-driven. Best for essays, frameworks, and evergreen learning libraries.',
    previewLabel: 'Reference atlas',
    configureClassName:
      'border-rule bg-paper-2 text-ink has-[:checked]:border-amber has-[:checked]:bg-amber/10',
    shellClassName: 'bg-paper-studio text-ink',
    heroClassName: 'border-b border-rule-dark bg-paper',
    cardClassName: 'border border-rule bg-paper-2',
    mutedTextClassName: 'text-ink-4',
    accentTextClassName: 'text-amber-ink',
    buttonClassName: 'bg-amber text-paper hover:opacity-90',
    evidenceVariant: 'paper',
  },
  midnight: {
    id: 'midnight',
    name: 'Playbook OS',
    tagline: 'A tactical dark-mode operating system for actionable lessons.',
    description:
      'Dense, high-contrast, and command-center oriented. Best for strategy, operations, and practical playbooks.',
    previewLabel: 'Operator playbook',
    configureClassName:
      'border-[#2A3038] bg-[#030507] text-[#F6F7F8] has-[:checked]:border-[#00E88A] has-[:checked]:bg-[#00E88A]/10',
    shellClassName: 'bg-[#030507] text-[#F6F7F8]',
    heroClassName: 'border-b border-[#2A3038] bg-[#030507]',
    cardClassName: 'border border-[#2A3038] bg-[#0B0F14]',
    mutedTextClassName: 'text-[#A7ADB5]',
    accentTextClassName: 'text-[#00E88A]',
    buttonClassName:
      'bg-[#00E88A] text-[#030507] font-semibold hover:opacity-90 transition-opacity duration-150',
    evidenceVariant: 'midnight',
  },
  field: {
    id: 'field',
    name: 'Studio Vault',
    tagline: 'A source-forward archive for creator knowledge collections.',
    description:
      'Vault-like, technical, and library-inspired. Best for content collections, workshops, and studio archives.',
    previewLabel: 'Archive vault',
    configureClassName:
      'border-[#2A3038] bg-[#111821] text-[#F6F7F8] has-[:checked]:border-[#FF9A3D] has-[:checked]:bg-[#FF9A3D]/10',
    shellClassName: 'bg-[#030507] text-[#F6F7F8]',
    heroClassName: 'border-b border-[#2A3038] bg-[#0B0F14]',
    cardClassName: 'border border-[#2A3038] bg-[#111821]',
    mutedTextClassName: 'text-[#A7ADB5]',
    accentTextClassName: 'text-[#FF9A3D]',
    buttonClassName:
      'bg-[#FF9A3D] text-[#030507] hover:opacity-85 transition-opacity duration-150',
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
