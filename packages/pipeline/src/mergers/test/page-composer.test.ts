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
