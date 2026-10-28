// Import from text. Fake subjects only.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { parseImport, planImport, subjectKey, markLabels } from '../importText.js';
import { calc } from '../grades.js';
import { newSubject } from '../edit.js';
import { db } from '../db.js';
import * as store from '../store.js';

const TEXT = `SAMPLE_A: Intro to Samples | Autumn 2026 | 6cp | D 77
Task 1 | 25% | 5/5, 20/20
Task 2 | 45% | 10/10, 20.58/35
Final exam | 30% | -/100 | hurdle 50

SAMPLE_B: Quiz Practice | Autumn 2026 | 6cp
Quizzes | 30% | Quiz 1=8/10, Quiz 2=9/10, Quiz 3=-/10
Project | 30% | -/100
Exam | 30% | -/100 | hurdle 50

SAMPLE_C | Spring 2025 | 3cp | PASS

SAMPLE_D | Spring 2025 | 6cp | C
Report | 50% | 12/x`;

describe('parseImport', () => {
  const { blocks, problems } = parseImport(TEXT);
  const by = Object.fromEntries(blocks.map((b) => [b.code, b]));

  it('reads subjects, sessions, credit points and results', () => {
    expect(blocks.map((b) => b.code)).toEqual(['SAMPLE_A', 'SAMPLE_B', 'SAMPLE_C']);
    expect(by.SAMPLE_A).toMatchObject({ name: 'Intro to Samples', year: 2026, session: 'Autumn', cp: 6, official: { grade: 'D', mark: 77 } });
    expect(by.SAMPLE_B.official).toBeNull();
    expect(by.SAMPLE_C).toMatchObject({ name: null, year: 2025, session: 'Spring', cp: 3, official: { grade: 'PASS', mark: null }, components: [] });
  });

  it('reads weights, parts, single marks, blanks and hurdles', () => {
    const [t1, t2, ex] = by.SAMPLE_A.components;
    expect(t1).toMatchObject({ name: 'Task 1', weight: 25, single: false, hurdle: null });
    expect(t1.items.map((i) => [i.name, i.score, i.max])).toEqual([['Part 1', 5, 5], ['Part 2', 20, 20]]);
    expect(t2.items[1].score).toBe(20.58);
    expect(ex).toMatchObject({ single: true, hurdle: 50 });
    expect(ex.items).toMatchObject([{ name: 'Mark', score: null, max: 100 }]);
    expect(by.SAMPLE_B.components[0].items.map((i) => [i.name, i.score])).toEqual([['Quiz 1', 8], ['Quiz 2', 9], ['Quiz 3', null]]);
  });

  it('gives the same component totals as typing them in', () => {
    const s = { ...newSubject({ code: 'X' }), components: by.SAMPLE_A.components };
    const r = calc(s);
    expect(r.comps[0].pct).toBe(100);
    expect(r.comps[1].pts).toBeCloseTo(30.58, 6);
  });

  it('flags problems by line: warnings import, errors skip only that subject', () => {
    expect(problems.map((p) => [p.line, p.level, p.code])).toEqual([
      [6, 'warn', 'SAMPLE_B'], [13, 'skip', 'SAMPLE_D'], [14, 'error', 'SAMPLE_D'],
    ]);
    expect(problems.find((p) => p.level === 'warn').text).toMatch(/90%/);
    expect(problems.find((p) => p.level === 'error').text).toMatch(/12\/x/);
  });

  it('handles optional bits: target, switches, year first, comments, no marks, a single named part', () => {
    const { blocks: b, problems: p } = parseImport(`# from Claude
FAKE_E | 2026 spring | target 75 | no gpa | no wam | HD 90
Exam | 100 | Final=-/60`);
    expect(p).toEqual([]);
    expect(b[0]).toMatchObject({ session: 'Spring', year: 2026, target: 75, countsGpa: false, countsWam: false, cp: null, official: { grade: 'HD', mark: 90 } });
    expect(b[0].components[0]).toMatchObject({ weight: 100, single: false });
    expect(b[0].components[0].items).toMatchObject([{ name: 'Final', score: null, max: 60 }]);
    const { blocks: c } = parseImport('FAKE_F | Summer 2026\nLab | 10%');
    expect(c[0].components[0]).toMatchObject({ single: true, items: [{ name: 'Mark', score: null, max: 100 }] });
  });

  it('explains unreadable lines in plain words', () => {
    const cases = [
      ['FAKE | 6cp', /session and year/],
      ['FAKE | Winter 2026', /Can't read “Winter 2026”/],
      ['FAKE | Autumn 2026\nTask | lots | 5/5', /weight “lots”/],
      ['FAKE | Autumn 2026\nTask | 10% | 5/0', /out of 0/],
      ['FAKE | Autumn 2026\nTask | 10% | 5/5 | bonus', /Only "hurdle 50"/],
      ['FAKE | Autumn 2026 | target 120', /between 0 and 100/],
      ['FAKE | Autumn 2026\n\nFAKE | Autumn 2026', /pasted twice/],
    ];
    for (const [t, re] of cases) {
      const { problems } = parseImport(t);
      expect(problems.some((p) => p.level === 'error' && re.test(p.text)), t).toBe(true);
    }
    expect(parseImport('FAKE | Autumn 2026\nTask | 10% | 12/10').problems[0]).toMatchObject({ level: 'warn' });
    expect(parseImport('').blocks).toEqual([]);
  });
});

describe('planImport', () => {
  const saved = () => {
    const s = newSubject({ code: 'sample_a', year: 2026, session: 'Autumn', target: 75 });
    s.uid = 'keep-me';
    s.name = 'Old name';
    s.components = parseImport('X | Autumn 2026\nTask 1 | 25% | 5/5, 20/20\nTask 2 | 45% | 10/10, 20/35\nFinal exam | 30% | -/100 | hurdle 50').blocks[0].components;
    return s;
  };

  it('matches on code (any case), year and session; others are new', () => {
    const plan = planImport(parseImport(TEXT).blocks, [saved()]);
    expect(plan.map((p) => p.status)).toEqual(['update', 'new', 'new']);
    expect(plan[0].subject.uid).toBe('keep-me');
    expect(plan[0].subject.code).toBe('sample_a');
    expect(plan[0].subject.name).toBe('Intro to Samples');
    expect(plan[0].subject.target).toBe(75); // no target in the text: kept
    expect(plan[0].subject.official).toEqual({ grade: 'D', mark: 77 });
    expect(plan[1].subject.uid).not.toBe(plan[2].subject.uid);
    expect(plan[2].subject).toMatchObject({ cp: 3, target: 85, countsGpa: true, countsWam: true });
  });

  it('shows which marks changed', () => {
    const [u] = planImport(parseImport(TEXT).blocks, [saved()]);
    expect(u.replaced).toBe(3);
    expect(u.changes.map((c) => c.changed)).toEqual([false, true, false]);
    expect(u.changes[1].was).toEqual(['Part 1 10/10', 'Part 2 20/35']);
    expect(markLabels(u.subject.components[1])).toEqual(['Part 1 10/10', 'Part 2 20.58/35']);
  });

  it('keeps saved assessments when the text has none, and reports no change when nothing differs', () => {
    const s = saved();
    const [u] = planImport(parseImport('SAMPLE_A | Autumn 2026 | D 80').blocks, [s]);
    expect(u.status).toBe('update');
    expect(u.subject.components).toEqual(s.components);
    const [same] = planImport(parseImport('SAMPLE_A: Old name | Autumn 2026\nTask 1 | 25% | 5/5, 20/20\nTask 2 | 45% | 10/10, 20/35\nFinal exam | 30% | -/100 | hurdle 50').blocks, [s]);
    expect(same.status).toBe('same');
    expect(same.subject).toBe(s);
  });

  it('a different session or year is a different subject', () => {
    const plan = planImport(parseImport('SAMPLE_A | Spring 2026\n\nSAMPLE_A | Autumn 2025').blocks, [saved()]);
    expect(plan.map((p) => p.status)).toEqual(['new', 'new']);
    expect(subjectKey({ code: 'ab c', year: 1, session: 'Autumn' })).toBe('ABC|1|Autumn');
  });
});

describe('importSubjects', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('saves new and updated subjects, stamps them and clears old delete marks', async () => {
    const s = await store.putSubject(newSubject({ code: 'SAMPLE_A', year: 2026, session: 'Autumn' }));
    await store.deleteSubject(s.uid);
    const plan = planImport(parseImport(TEXT).blocks, []);
    plan[0].subject.uid = s.uid; // re-import of a subject deleted here earlier
    await store.importSubjects(plan.map((p) => p.subject));
    const rows = await db.subjects.toArray();
    expect(rows.map((r) => r.code).sort()).toEqual(['SAMPLE_A', 'SAMPLE_B', 'SAMPLE_C']);
    expect(rows.every((r) => r.updatedAt > 0)).toBe(true);
    expect((await store.readSnapshot()).tombstones[s.uid]).toBeUndefined();
  });
});
