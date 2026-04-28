'use client';

import { useState } from 'react';

import { Panel, PanelHeader, StatusPill } from '@/components/cc';
import { HUB_TEMPLATE_OPTIONS } from '@/components/hub/templates';

import { createProject } from './actions';
import { ConfigureSubmitButton } from './ConfigureButtons';

type Tone = 'conversational' | 'professional' | 'academic';
type Depth = 'short' | 'standard' | 'deep';
type TemplateId = 'paper' | 'midnight' | 'field';
type VoiceMode = 'reader_second_person' | 'creator_first_person';

const TONE_OPTIONS: Array<[Tone, string, string]> = [
  ['conversational', 'Conversational', 'Clear, direct, creator-led'],
  ['professional', 'Professional', 'Structured and polished'],
  ['academic', 'Academic', 'Dense and formal'],
];

const DEPTH_OPTIONS: Array<[Depth, string, string]> = [
  ['short', 'Concise', 'Key ideas only'],
  ['standard', 'Standard', 'Balanced depth'],
  ['deep', 'Deep', 'Full coverage'],
];

const VOICE_OPTIONS: Array<[VoiceMode, string, string]> = [
  [
    'reader_second_person',
    'Direct (you-pronoun)',
    '"If you want to win retainers, embed Phase 2 hooks in your Phase 1 proposal."',
  ],
  [
    'creator_first_person',
    "Creator's voice (first-person)",
    '"I built the proposal generator after losing too many deals to slow turnaround."',
  ],
];

export function ConfigureClient({
  videoIds,
  selectedVideoCount,
  totalSeconds,
  requiresLimitedSourceConfirmation,
  priceLabel,
}: {
  videoIds: string[];
  selectedVideoCount: number;
  totalSeconds: number;
  requiresLimitedSourceConfirmation: boolean;
  priceLabel: string;
}) {
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState<Tone>('conversational');
  const [depth, setDepth] = useState<Depth>('standard');
  const [template, setTemplate] = useState<TemplateId>('paper');
  const [chatEnabled, setChatEnabled] = useState(true);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('reader_second_person');

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
      <form action={createProject} className="space-y-4">
        <input type="hidden" name="video_ids" value={videoIds.join(',')} />

        <Panel>
          <PanelHeader title="Hub brief" />
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <Field label="Hub title" htmlFor="title" required>
              <input
                id="title"
                name="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. The Creator Operating System"
                className="h-10 w-full rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-3 text-[14px] text-[var(--cc-ink)] outline-none placeholder:text-[var(--cc-ink-4)] focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
              />
            </Field>
            <Field label="Target audience" htmlFor="audience">
              <input
                id="audience"
                name="audience"
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Founders building a content engine"
                className="h-10 w-full rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-3 text-[14px] text-[var(--cc-ink)] outline-none placeholder:text-[var(--cc-ink-4)] focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
              />
            </Field>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Generation style" />
          <div className="space-y-5 p-5">
            <ChoiceGroup
              label="Tone"
              name="tone"
              options={TONE_OPTIONS}
              value={tone}
              onChange={setTone}
            />
            <ChoiceGroup
              label="Hub depth"
              name="length_preset"
              options={DEPTH_OPTIONS}
              value={depth}
              onChange={setDepth}
            />
            <div>
              <p className="text-[11px] leading-[1.5] text-[var(--cc-ink-3)]">
                Direct (you-pronoun) reads as a how-to. Creator&apos;s voice (first-person)
                reads as the creator&apos;s own commentary. Choose direct unless this hub is
                primarily personal essays.
              </p>
              <div className="mt-2">
                <ChoiceGroup
                  label="Voice"
                  name="voiceMode"
                  options={VOICE_OPTIONS}
                  value={voiceMode}
                  onChange={setVoiceMode}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Public template" meta="Editorial Atlas · Playbook OS · Studio Vault" />
          <div
            className="grid gap-2.5 p-5 md:grid-cols-3"
            role="radiogroup"
            aria-label="Hub template"
          >
            {HUB_TEMPLATE_OPTIONS.map((tmpl) => {
              const checked = template === tmpl.id;
              return (
                <label
                  key={tmpl.id}
                  className={`flex min-h-[140px] cursor-pointer flex-col rounded-[10px] border p-4 text-[var(--cc-ink)] transition ${
                    checked
                      ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-wash)] shadow-[inset_0_0_0_1px_var(--cc-accent)]'
                      : 'border-[var(--cc-rule)] bg-[var(--cc-surface)] hover:border-[var(--cc-ink-4)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="presentation_preset"
                    value={tmpl.id}
                    checked={checked}
                    onChange={() => setTemplate(tmpl.id as TemplateId)}
                    className="sr-only"
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--cc-ink-4)]">
                    {tmpl.previewLabel}
                  </span>
                  <span className="mt-2 text-[14px] font-semibold">{tmpl.name}</span>
                  <span className="mt-1.5 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
                    {tmpl.tagline}
                  </span>
                </label>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Reader features" />
          <div className="p-5">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-4 py-3.5">
              <span>
                <span className="block text-[13px] font-semibold text-[var(--cc-ink)]">
                  Enable grounded chat
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--cc-ink-4)]">
                  Members can ask questions; answers cite the lesson + source moment.
                </span>
              </span>
              <input
                type="checkbox"
                name="chat_enabled"
                value="true"
                checked={chatEnabled}
                onChange={(e) => setChatEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--cc-accent)]"
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Order summary" meta={priceLabel} />
          <div className="space-y-3 p-5">
            <SummaryRow label="Hub generation" value={priceLabel} />
            <SummaryRow label="Videos included" value={`${selectedVideoCount} videos`} />
            <SummaryRow label="Source runtime" value={fmtDuration(totalSeconds)} />
            <SummaryRow label="Expected delivery" value="~4 minutes" />

            {requiresLimitedSourceConfirmation ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[var(--cc-warn)]/40 bg-[var(--cc-warn-wash)] px-4 py-3 text-[12px] leading-[1.55] text-[var(--cc-warn)]">
                <input
                  type="checkbox"
                  name="allow_limited_source"
                  value="true"
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--cc-warn)]"
                />
                <span>
                  I understand this hub may publish with limited source support because no
                  selected videos have confirmed captions.
                </span>
              </label>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-[var(--cc-rule)] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] text-[var(--cc-ink-4)]">
                Payment is processed securely by Stripe.
              </p>
              <ConfigureSubmitButton
                label={
                  requiresLimitedSourceConfirmation
                    ? 'Continue with limited source'
                    : 'Continue to payment'
                }
                pendingLabel="Creating project..."
              />
            </div>
          </div>
        </Panel>
      </form>

      <aside>
        <div className="xl:sticky xl:top-[66px]">
          <LivePreview
            title={title}
            audience={audience}
            tone={tone}
            depth={depth}
            template={template}
            chatEnabled={chatEnabled}
            sourceCount={selectedVideoCount}
          />
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2" htmlFor={htmlFor}>
      <span className="text-[12px] font-semibold text-[var(--cc-ink)]">
        {label}
        {required ? <span className="ml-1 text-[var(--cc-danger)]">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function ChoiceGroup<V extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: Array<[V, string, string]>;
  value: V;
  onChange: (next: V) => void;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-[var(--cc-ink)]">{label}</p>
      <div
        className="mt-2 grid gap-2 md:grid-cols-3"
        role="radiogroup"
        aria-label={label}
      >
        {options.map(([key, t, body]) => {
          const checked = value === key;
          return (
            <label
              key={key}
              className={`cursor-pointer rounded-[10px] border p-3 transition ${
                checked
                  ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-wash)] shadow-[inset_0_0_0_1px_var(--cc-accent)]'
                  : 'border-[var(--cc-rule)] bg-[var(--cc-surface)] hover:border-[var(--cc-ink-4)]'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={key}
                checked={checked}
                onChange={() => onChange(key)}
                className="sr-only"
              />
              <span className="block text-[13px] font-semibold text-[var(--cc-ink)]">{t}</span>
              <span className="mt-1 block text-[11px] leading-[1.5] text-[var(--cc-ink-3)]">
                {body}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-[13px]">
      <span className="text-[var(--cc-ink-4)]">{label}</span>
      <span className="text-right font-semibold text-[var(--cc-ink)]">{value}</span>
    </div>
  );
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Live preview — renders an interactive, theme-aware hub mock.
// Templates are placeholders for the eventual Phase 5 rebuild; this is space-
// holding fidelity, not the final reader experience.
// ---------------------------------------------------------------------------

const TEMPLATE_LABEL: Record<TemplateId, string> = {
  paper: 'Editorial Atlas',
  midnight: 'Playbook OS',
  field: 'Studio Vault',
};

const TONE_BODY: Record<Tone, string> = {
  conversational:
    "Here's the operating principle in plain terms — the way I'd explain it to a friend who's about to make the same mistake I made twice.",
  professional:
    'The operating principle below isolates the decision logic. Apply it before scoping commitments — it filters most categories of avoidable rework.',
  academic:
    'The following framework formalizes the recurring decision pattern observed across the source corpus, encoded as a sequence of preconditions and adjudicated outcomes.',
};

const TONE_TITLE: Record<Tone, string> = {
  conversational: 'The decision I keep coming back to',
  professional: 'A reusable decision framework',
  academic: 'On the iterative refinement of operator decisions',
};

const DEPTH_PARAGRAPHS: Record<Depth, number> = {
  short: 1,
  standard: 2,
  deep: 3,
};

function LivePreview({
  title,
  audience,
  tone,
  depth,
  template,
  chatEnabled,
  sourceCount,
}: {
  title: string;
  audience: string;
  tone: Tone;
  depth: Depth;
  template: TemplateId;
  chatEnabled: boolean;
  sourceCount: number;
}) {
  const styles = stylesFor(template);
  const body = TONE_BODY[tone];
  const heading = TONE_TITLE[tone];
  const paragraphs = DEPTH_PARAGRAPHS[depth];
  const displayTitle = title.trim() || 'Your hub title';
  const displayAudience = audience.trim() || 'Your target audience';

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Live preview"
        meta={
          <span className="inline-flex items-center gap-2">
            <StatusPill tone="accent" withDot={false}>
              {TEMPLATE_LABEL[template]}
            </StatusPill>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cc-ink-4)]">
              {tone} · {depth}
            </span>
          </span>
        }
      />
      <div className="border-b border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 px-4 py-2">
        <p className="font-mono text-[10px] tabular-nums text-[var(--cc-ink-4)]">
          creatorcanon.com/h/{slugify(displayTitle)}
        </p>
      </div>
      <div className={`relative overflow-hidden ${styles.shell}`}>
        {/* Hub mini-shell */}
        <div className={`grid grid-cols-[88px_minmax(0,1fr)] ${styles.shell}`}>
          {/* Mini sidebar */}
          <div className={`flex flex-col gap-1.5 px-2 py-3 ${styles.sidebar}`}>
            <div className={`flex items-center gap-1.5 px-1.5 py-1 ${styles.brand}`}>
              <span className={`size-3.5 rounded-[3px] ${styles.brandMark}`} aria-hidden />
              <span className="text-[8px] font-semibold tracking-tight">
                {abbreviate(displayTitle)}
              </span>
            </div>
            {[
              ['01', 'Start'],
              ['02', 'Tracks'],
              ['03', 'Lessons'],
              ['04', 'Atlas'],
            ].map(([n, label], i) => (
              <div
                key={n}
                className={`flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[8px] ${
                  i === 0 ? styles.navActive : styles.navIdle
                }`}
              >
                <span className={`font-mono text-[8px] ${styles.accent}`}>{n}</span>
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>

          {/* Mini content */}
          <div className={`px-3 py-3 ${styles.body}`}>
            <p className={`text-[8px] uppercase tracking-[0.14em] ${styles.muted}`}>
              {audience.trim() ? `For ${displayAudience}` : 'Reading note'}
            </p>
            <h3
              className={`mt-1.5 [text-wrap:balance] leading-[1.1] ${styles.title}`}
            >
              {displayTitle}
            </h3>
            <p className={`mt-2 text-[9px] leading-[1.5] ${styles.lede}`}>
              {body}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1">
              <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${styles.pill}`}>
                Well supported
              </span>
              <span className={`text-[8px] ${styles.muted}`}>
                {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
              </span>
            </div>
          </div>
        </div>

        {/* Mini lesson card */}
        <div className={`border-t px-4 py-3.5 ${styles.lessonBorder} ${styles.lessonBg}`}>
          <p className={`text-[10px] uppercase tracking-[0.14em] ${styles.accent}`}>
            Sample lesson
          </p>
          <h4 className={`mt-1.5 text-[14px] font-semibold leading-tight ${styles.lessonHeading}`}>
            {heading}
          </h4>
          <div className="mt-2 space-y-2">
            {Array.from({ length: paragraphs }).map((_, i) => (
              <p key={i} className={`text-[11px] leading-[1.6] ${styles.lessonBody}`}>
                {body}
              </p>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className={`font-mono text-[10px] ${styles.muted}`}>14:08–14:42</span>
            <span className={`text-[10px] font-semibold ${styles.accent}`}>Source ↗</span>
          </div>
        </div>

        {chatEnabled ? (
          <div className={`flex items-center justify-between gap-2 border-t px-4 py-2 ${styles.lessonBorder} ${styles.footerBg}`}>
            <span className={`text-[10px] ${styles.muted}`}>Grounded chat · members only</span>
            <span className={`text-[10px] font-semibold ${styles.accent}`}>
              Ask Atlas →
            </span>
          </div>
        ) : null}
      </div>
      <p className="px-4 py-2.5 text-[11px] leading-[1.5] text-[var(--cc-ink-4)]">
        Preview updates as you edit. Final hub rendering ships in a later release — Atlas + Playbook templates are reskinned for production in the next phase.
      </p>
    </Panel>
  );
}

type ThemeStyles = {
  shell: string;
  sidebar: string;
  brand: string;
  brandMark: string;
  navActive: string;
  navIdle: string;
  body: string;
  muted: string;
  title: string;
  lede: string;
  pill: string;
  accent: string;
  lessonBorder: string;
  lessonBg: string;
  lessonHeading: string;
  lessonBody: string;
  footerBg: string;
};

function stylesFor(template: TemplateId): ThemeStyles {
  if (template === 'midnight') {
    return {
      shell: 'bg-[#030507] text-[#F6F7F8]',
      sidebar: 'bg-[#0B0F14] border-r border-[#2A3038]',
      brand: 'text-[#F6F7F8]',
      brandMark: 'bg-[#00E88A]',
      navActive: 'bg-[#111821] text-[#F6F7F8]',
      navIdle: 'text-[#A7ADB5]',
      body: 'bg-[#030507]',
      muted: 'text-[#737B86]',
      title: 'font-serif text-[18px] text-[#F6F7F8]',
      lede: 'text-[#D9DEE5]',
      pill: 'bg-[#00E88A]/15 text-[#00E88A]',
      accent: 'text-[#00E88A]',
      lessonBorder: 'border-[#2A3038]',
      lessonBg: 'bg-[#0B0F14]',
      lessonHeading: 'text-[#F6F7F8]',
      lessonBody: 'text-[#D9DEE5]',
      footerBg: 'bg-[#111821]',
    };
  }
  if (template === 'field') {
    return {
      shell: 'bg-[#030507] text-[#F6F7F8]',
      sidebar: 'bg-[#111821] border-r border-[#2A3038]',
      brand: 'text-[#F6F7F8]',
      brandMark: 'bg-[#FF9A3D]',
      navActive: 'bg-[#0B0F14] text-[#F6F7F8]',
      navIdle: 'text-[#A7ADB5]',
      body: 'bg-[#0B0F14]',
      muted: 'text-[#737B86]',
      title: 'font-serif text-[18px] text-[#F6F7F8]',
      lede: 'text-[#D9DEE5]',
      pill: 'bg-[#FF9A3D]/15 text-[#FF9A3D]',
      accent: 'text-[#FF9A3D]',
      lessonBorder: 'border-[#2A3038]',
      lessonBg: 'bg-[#111821]',
      lessonHeading: 'text-[#F6F7F8]',
      lessonBody: 'text-[#D9DEE5]',
      footerBg: 'bg-[#0B0F14]',
    };
  }
  // paper (default)
  return {
    shell: 'bg-[var(--cc-canvas)] text-[var(--cc-ink)]',
    sidebar: 'bg-[var(--cc-surface)] border-r border-[var(--cc-rule)]',
    brand: 'text-[var(--cc-ink)]',
    brandMark: 'bg-[var(--cc-accent)]',
    navActive: 'bg-[var(--cc-accent-wash)] text-[var(--cc-ink)]',
    navIdle: 'text-[var(--cc-ink-4)]',
    body: 'bg-[var(--cc-canvas)]',
    muted: 'text-[var(--cc-ink-4)]',
    title: 'font-serif text-[18px] text-[var(--cc-ink)]',
    lede: 'text-[var(--cc-ink-2)]',
    pill: 'bg-[var(--cc-success-wash)] text-[var(--cc-success)]',
    accent: 'text-[var(--cc-accent)]',
    lessonBorder: 'border-[var(--cc-rule)]',
    lessonBg: 'bg-[var(--cc-surface)]',
    lessonHeading: 'text-[var(--cc-ink)]',
    lessonBody: 'text-[var(--cc-ink-2)]',
    footerBg: 'bg-[var(--cc-surface-2)]',
  };
}

function abbreviate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'CC';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'CC';
}

function slugify(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return 'your-hub';
  return (
    trimmed
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || 'your-hub'
  );
}
