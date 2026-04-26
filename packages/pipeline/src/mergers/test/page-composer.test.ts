import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { composePage } from '../page-composer';

describe('composePage', () => {
  it('composes a lesson page with overview + paragraph', async () => {
    const page = await composePage({
      primary: {
        id: 'fnd_1', runId: 'r', type: 'lesson', agent: 'lesson_extractor', model: 'gpt-5.5',
        evidenceQuality: 'strong', evidenceSegmentIds: ['s1'],
        payload: { title: 'Treat writing as thinking', summary: 'A short summary describing the idea.', idea: 'When you write you discover what you think.' },
        costCents: '0' as any, durationMs: 0, createdAt: new Date(),
      } as any,
      related: [], relations: [], polishProvider: null,
    });
    assert.equal(page.type, 'lesson');
    assert.equal(page.sections[0]?.kind, 'overview');
    assert.equal(page.sections[1]?.kind, 'paragraph');
    assert.equal(page.summary, 'A short summary describing the idea.');
  });

  it('skips empty optional sections (framework without steps)', async () => {
    const page = await composePage({
      primary: {
        id: 'fnd_2', runId: 'r', type: 'framework', agent: 'fe', model: 'gpt-5.5',
        evidenceQuality: 'strong', evidenceSegmentIds: ['s1','s2'],
        payload: { title: 'F', summary: 'S', principles: [{ title: 'p', body: 'b' }] },
        costCents: '0' as any, durationMs: 0, createdAt: new Date(),
      } as any,
      related: [], relations: [], polishProvider: null,
    });
    assert.equal(page.sections.find((s) => s.kind === 'steps'), undefined);
  });

  it('populates citations on each section from primary evidence', async () => {
    const page = await composePage({
      primary: {
        id: 'fnd_3', runId: 'r', type: 'lesson', agent: 'le', model: 'gpt-5.5',
        evidenceQuality: 'strong', evidenceSegmentIds: ['s1', 's2'],
        payload: { title: 'X', summary: 'Y', idea: 'A long enough idea passage.' },
        costCents: '0' as any, durationMs: 0, createdAt: new Date(),
      } as any,
      related: [], relations: [], polishProvider: null,
    });
    for (const sec of page.sections) {
      assert.ok(Array.isArray((sec as any).citations));
      assert.deepEqual((sec as any).citations.sort(), ['s1', 's2']);
    }
  });

  it('disambiguates citations for quote vs aha_moment quote sections', async () => {
    const page = await composePage({
      primary: {
        id: 'fnd_5', runId: 'r', type: 'lesson', agent: 'le', model: 'gpt-5.5',
        evidenceQuality: 'strong', evidenceSegmentIds: ['s_primary'],
        payload: { title: 'Disambiguation', summary: 'Test', idea: 'Idea text here.' },
        costCents: '0' as any, durationMs: 0, createdAt: new Date(),
      } as any,
      related: [
        {
          id: 'fnd_q', runId: 'r', type: 'quote', agent: 'quote_finder', model: 'gpt-5.5',
          evidenceQuality: 'strong', evidenceSegmentIds: ['s_q'],
          payload: { text: 'A plain quote', attribution: 'Someone' },
          costCents: '0' as any, durationMs: 0, createdAt: new Date(),
        } as any,
        {
          id: 'fnd_a', runId: 'r', type: 'aha_moment', agent: 'aha_detector', model: 'gpt-5.5',
          evidenceQuality: 'strong', evidenceSegmentIds: ['s_a'],
          payload: { quote: 'An aha moment', attribution: 'Creator' },
          costCents: '0' as any, durationMs: 0, createdAt: new Date(),
        } as any,
      ],
      relations: [], polishProvider: null,
    });
    const quoteSections = page.sections.filter((s) => s.kind === 'quote') as any[];
    // There should be two quote sections (one for aha_moment, one for quote).
    assert.equal(quoteSections.length, 2);
    // The aha_moment quote section should cite s_a; the plain quote section should cite s_q.
    const ahaSec = quoteSections.find((s) => s.citations.includes('s_a'));
    const qSec   = quoteSections.find((s) => s.citations.includes('s_q'));
    assert.ok(ahaSec, 'aha_moment quote section must include s_a in citations');
    assert.ok(qSec,   'plain quote section must include s_q in citations');
    // Each section should NOT bleed into the other's evidence.
    assert.ok(!ahaSec.citations.includes('s_q'), 'aha section should not include s_q');
    assert.ok(!qSec.citations.includes('s_a'),   'quote section should not include s_a');
    // Neither should carry the private hint.
    assert.equal((ahaSec as any)._sourceFindingType, undefined);
    assert.equal((qSec as any)._sourceFindingType, undefined);
  });

  it('emits exploratory callout when evidenceQuality is not strong (framework)', async () => {
    const page = await composePage({
      primary: {
        id: 'fnd_4', runId: 'r', type: 'framework', agent: 'fe', model: 'gpt-5.5',
        evidenceQuality: 'limited', evidenceSegmentIds: ['s1','s2'],
        payload: { title: 'F', summary: 'S', principles: [{ title: 'p', body: 'b' }] },
        costCents: '0' as any, durationMs: 0, createdAt: new Date(),
      } as any,
      related: [], relations: [], polishProvider: null,
    });
    const callout = page.sections.find((s) => s.kind === 'callout') as any;
    assert.ok(callout);
    assert.equal(callout.tone, 'note');
  });
});
