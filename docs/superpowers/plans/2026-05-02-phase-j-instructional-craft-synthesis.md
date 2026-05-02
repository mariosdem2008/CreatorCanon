# Phase J — Instructional-Craft Product Synthesis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Build the product synthesis layer for instructional-craft archetype creators (Tiago Forte, Ali Abdaal, Jay Clouse — though Clouse audited as operator-coach in Phase 8). The PRODUCT MOMENT is **finishing Lesson N and having a working version of the thing** — sequenced learning with check-points and practice.

**Architecture:** Reuses Worksheet Forge from Phase A (operator-coach also benefits from worksheets). Adds Lesson Sequencer (orders canons by prerequisite) + Practice Builder (worksheet variants tuned for "do this exercise" rather than "fill this out"). Plus an LMS-style shell with progress tracking.

**Owner:** Claude.

**Dependencies:** Phase A (Worksheet Forge reused).

**Estimated weeks:** 4 (weeks 18-22 of meta-timeline).

---

## File structure

```
packages/synthesis/src/composers/
  lesson-sequencer.ts                                ← NEW
  lesson-sequencer.test.ts
  practice-builder.ts                                ← NEW
  practice-builder.test.ts
  checkpoint-composer.ts                             ← NEW (between-lesson knowledge checks)
  checkpoint-composer.test.ts

packages/synthesis/src/types.ts                      ← extend with LessonSequence, Practice, Checkpoint

apps/web/src/components/hub/shells/instructional-craft/
  index.tsx
  pages/
    HomePage.tsx                                     ← path overview / start lesson 1
    LessonPage.tsx                                   ← single lesson with body + practice
    PracticePage.tsx                                 ← exercise alone
    CheckpointPage.tsx                               ← knowledge check between lessons
    LibraryPage.tsx                                  ← reference index
  data-adapter.ts
  ProgressTracker.tsx                                ← persistent per-user progress
  LessonNavigator.tsx                                ← prev/next + jump
```

---

## Tasks

### J.1 — LessonSequence + Practice + Checkpoint types

```ts
export interface Lesson {
  id: string;
  position: number;
  title: string;
  introHook: string;                      // 2-3 sentences setting up "why this lesson"
  bodyCanonIds: string[];                 // 1-3 canons mostly per lesson
  prerequisiteLessonIds: string[];
  outcomeStatement: string;               // "by the end, you'll have ..."
  estimatedMinutes: number;
}

export interface Practice {
  id: string;
  lessonId: string;
  prompt: string;
  exerciseType: 'fill_template' | 'free_form_writing' | 'classify' | 'apply_framework';
  startingMaterial?: string;              // template / scaffold
  rubric: string;                         // self-grading criteria
}

export interface Checkpoint {
  id: string;
  afterLessonId: string;
  questions: Array<{ prompt: string; correctAnswer: string; explanation: string }>;
}

export interface LessonSequenceComponent {
  lessons: Lesson[];
  practices: Practice[];
  checkpoints: Checkpoint[];
}
```

### J.2 — Lesson Sequencer

Pure-code core + Codex-authored copy:
- Topologically sort canons by prerequisite (reuse Phase A's topoSort util)
- Group into 5-15 lessons (cluster small canons together; split large)
- For each lesson: Codex authors intro hook + outcome statement (2 calls per lesson)
- Estimate duration from word count + complexity heuristics

### J.3 — Practice Builder

For each lesson: 1 Codex call to generate a practice exercise. Choose `exerciseType` based on the lesson's primary canon type:
- `framework` → `apply_framework` (apply the framework to the reader's situation)
- `pattern` → `classify` (classify a set of provided examples)
- `playbook` → `fill_template` (fill out a template the lesson teaches)
- `principle` → `free_form_writing` (reflect on the principle in your context)

### J.4 — Checkpoint Composer

After every 2-3 lessons: 1 knowledge check. 3-5 multiple-choice questions about lesson content. Codex authors. Auto-graded with explanations.

### J.5 — Instructional-craft shell

LMS-style. Left rail: lesson list with completion checkmarks. Main: current lesson body + practice. Top: progress bar. ProgressTracker uses localStorage + (if logged in) syncs to DB.

### J.6 — Cohort smoke test

If we have an instructional-craft creator in cohort: run on them. If not: synthesize on Clouse (he's operator-coach but his content has lesson-like structure) for verification.

### J.7 — Phase J results doc + PR

---

## Success criteria

- [ ] At least 1 cohort creator has full instructional-craft product bundle
- [ ] Lesson 1 → 2 → 3 navigation works with progress tracking
- [ ] Practice exercises render correctly per type
- [ ] Checkpoints auto-grade + show explanations

## Out of scope

- Video embedded inline (use timestamped links to source v1)
- Discussion threads per lesson (defer)
- Cohort/group learning features (defer)
