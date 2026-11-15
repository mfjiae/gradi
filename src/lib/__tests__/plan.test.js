// Degree planner tests (M7). Fake subjects only: real grades never go in this public repo.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  planStatus, degreeProgress, finishSession, loadState, gradGpa, shiftSession, canShift, planGroups,
  upcomingLoads, nextSession, defaultAvg, isFuture, DEFAULT_DEGREE_TOTAL,
} from '../plan.js';
import { mergeSnapshots, normalize } from '../merge.js';
import { planRestore } from '../backup.js';
import * as E from '../edit.js';
import { db } from '../db.js';
import * as store from '../store.js';

let n = 0;
const id = () => `p${++n}`;
const CUR = { year: 2026, session: 'Spring' };
const mark = (score, max = 100) => [{ id: id(), name: 'Exam', weight: 100, single: true, hurdle: null, items: [{ id: id(), name: 'Mark', score, max, w: null }] }];
const subj = (o) => ({ uid: id(), code: `FAKE${n}`, name: '', year: 2026, session: 'Spring', cp: 6, target: 85, components: [], official: null, ...o });
const off = (grade, o = {}) => subj({ year: 2025, session: 'Autumn', official: { grade, mark: null }, ...o });

describe('planStatus', () => {
  it('sorts subjects into done, now, waiting, enrolled and planned', () => {
    expect(planStatus(off('HD'), CUR)).toBe('done');
    expect(planStatus(off('F'), CUR)).toBe('done');
    expect(planStatus(subj({}), CUR)).toBe('now');
    expect(planStatus(subj({ year: 2026, session: 'Autumn' }), CUR)).toBe('waiting');
    expect(planStatus(subj({ year: 2027, session: 'Autumn', enrolled: true }), CUR)).toBe('enrolled');
    expect(planStatus(subj({ year: 2027, session: 'Autumn' }), CUR)).toBe('planned');
    // Summer 2026 comes after Spring 2026 (UTS Summer runs Dec to Jan).
    expect(isFuture(subj({ year: 2026, session: 'Summer' }), CUR)).toBe(true);
  });
});

describe('degreeProgress', () => {
  const list = [
    off('HD'), off('D'), off('PASS', { cp: 3 }),
    off('F'), // failed: shown, gains nothing
    off('HD', { countsDegree: false }), off('C', { countsDegree: false }), // old major: gained, not counted
    subj({}), subj({}), // this session
    subj({ year: 2026, session: 'Autumn' }), // earlier session, no result recorded yet
    subj({ year: 2027, session: 'Autumn' }), subj({ year: 2027, session: 'Spring', cp: 0 }),
    subj({ year: 2028, session: 'Spring', countsDegree: false }), // planned but switched off: ignored
  ];
  it('splits the degree into done, this session, planned and left', () => {
    const p = degreeProgress(list, CUR, 198);
    expect(p).toEqual({ total: 198, done: 15, now: 18, planned: 6, left: 159, over: 0, notCounted: 12 });
  });
  it('defaults to 198 cp and reports credit points beyond the total', () => {
    expect(degreeProgress([], CUR).total).toBe(DEFAULT_DEGREE_TOTAL);
    const p = degreeProgress(list, CUR, 30);
    expect(p.left).toBe(0);
    expect(p.over).toBe(9);
  });
});

describe('finishSession', () => {
  it('is null while credit points still have no session', () => {
    expect(finishSession([off('HD'), subj({ year: 2027, session: 'Autumn' })], CUR, 198)).toBeNull();
  });
  it('is the last session with an unfinished counted subject once everything is planned', () => {
    const list = [off('HD'), subj({}), subj({ year: 2028, session: 'Spring' }), subj({ year: 2027, session: 'Autumn' }), subj({ year: 2029, session: 'Autumn', countsDegree: false })];
    expect(finishSession(list, CUR, 24)).toMatchObject({ year: 2028, session: 'Spring' });
  });
  it('falls back to the last counted result when nothing is left to do', () => {
    expect(finishSession([off('HD'), off('D', { year: 2026, session: 'Autumn' })], CUR, 12)).toMatchObject({ year: 2026, session: 'Autumn' });
  });
});

describe('loadState', () => {
  it('flags sessions above 27 cp and above 30 cp', () => {
    expect(loadState(27).k).toBe('ok');
    expect(loadState(30).k).toBe('warn');
    expect(loadState(30).label).toBe('Needs approval');
    expect(loadState(33).k).toBe('bad');
    expect(loadState(33).label).toBe('Over 30 cp');
  });
});

describe('gradGpa (rule 2)', () => {
  // Official 12 cp at 7 and 6; this session: one marked at 78 (D = 6), one unmarked; 2027: 6 cp planned.
  const list = [
    off('HD'), off('D'), off('PASS', { cp: 3 }),
    subj({ components: mark(78) }), subj({}),
    subj({ year: 2027, session: 'Autumn' }),
    subj({ year: 2027, session: 'Autumn', countsGpa: false }), // pass / not graded: never in GPA
  ];
  it('uses official results, marks so far, then the slider for the rest', () => {
    const g = gradGpa(list, 5);
    expect(g.offCp).toBe(12);
    expect(g.offGpa).toBeCloseTo(6.5, 9);
    expect(g.markCp).toBe(6);
    expect(g.markGpa).toBe(6);
    expect(g.restCp).toBe(12);
    expect(g.gpa).toBeCloseTo((42 + 36 + 36 + 12 * 5) / 30, 9);
  });
  it('moves with the slider and handles an empty list', () => {
    expect(gradGpa(list, 7).gpa).toBeGreaterThan(gradGpa(list, 4).gpa);
    expect(gradGpa([], 6).gpa).toBeNull();
  });
  it('treats a failed hurdle as F so far', () => {
    const comp = [{ id: id(), name: 'Exam', weight: 100, single: true, hurdle: 50, items: [{ id: id(), name: 'Mark', score: 40, max: 100, w: null }] }];
    const g = gradGpa([subj({ components: comp })], 6);
    expect(g.markGpa).toBe(0);
  });
  it('rounds the slider default from the official GPA, kept between 4 and 7', () => {
    expect(defaultAvg(list)).toBe(6.5);
    expect(defaultAvg([])).toBe(6);
    expect(defaultAvg([off('P')])).toBe(4);
  });
});

describe('moving sessions', () => {
  it('steps through Autumn and Spring', () => {
    expect(shiftSession({ year: 2027, session: 'Autumn' }, 1)).toEqual({ year: 2027, session: 'Spring' });
    expect(shiftSession({ year: 2027, session: 'Spring' }, 1)).toEqual({ year: 2028, session: 'Autumn' });
    expect(shiftSession({ year: 2027, session: 'Autumn' }, -1)).toEqual({ year: 2026, session: 'Spring' });
    expect(shiftSession({ year: 2027, session: 'Spring' }, -1)).toEqual({ year: 2027, session: 'Autumn' });
    expect(shiftSession({ year: 2026, session: 'Summer' }, 1)).toEqual({ year: 2027, session: 'Autumn' });
    expect(shiftSession({ year: 2026, session: 'Summer' }, -1)).toEqual({ year: 2026, session: 'Spring' });
    expect(nextSession(CUR)).toEqual({ year: 2027, session: 'Autumn' });
  });
  it('only moves later unfinished subjects, never into the current session or past the limit', () => {
    expect(canShift(subj({ year: 2027, session: 'Autumn' }), -1, CUR)).toBe(false);
    expect(canShift(subj({ year: 2027, session: 'Spring' }), -1, CUR)).toBe(true);
    expect(canShift(subj({ year: 2027, session: 'Autumn' }), 1, CUR)).toBe(true);
    expect(canShift(subj({}), 1, CUR)).toBe(false);
    expect(canShift(subj({ year: 2027, session: 'Autumn', official: { grade: 'HD', mark: 90 } }), 1, CUR)).toBe(false);
    expect(canShift(subj({ year: 2032, session: 'Spring' }), 1, CUR)).toBe(false);
  });
  it('setSession is a pure edit', () => {
    const s = subj({ year: 2027, session: 'Autumn' });
    const t = E.setSession(s, { year: 2028, session: 'Spring' });
    expect([t.year, t.session]).toEqual([2028, 'Spring']);
    expect([s.year, s.session]).toEqual([2027, 'Autumn']);
    expect(E.setSession(s, { year: 2028, session: 'Winter' }).session).toBe('Autumn');
  });
  it('the enrolled box and the counts-toward-degree switch are pure edits', () => {
    const s = subj({});
    expect(E.setDetails(s, { enrolled: true }).enrolled).toBe(true);
    expect(E.setDetails(s, { code: 'X' }).enrolled).toBeUndefined();
    expect(E.toggleCount(s, 'countsDegree').countsDegree).toBe(false);
    expect(E.toggleCount({ ...s, countsDegree: false }, 'countsDegree').countsDegree).toBe(true);
  });
});

describe('planGroups', () => {
  const list = [
    off('HD', { year: 2025, session: 'Spring', code: 'B' }), off('D', { year: 2025, session: 'Autumn' }),
    subj({ year: 2026, session: 'Autumn', official: { grade: 'C', mark: 70 } }),
    subj({ year: 2027, session: 'Spring', code: 'Z' }), subj({ year: 2027, session: 'Spring', code: 'A', enrolled: true }),
    subj({ year: 2027, session: 'Autumn' }), subj({ year: 2028, session: 'Autumn' }),
  ];
  it('puts this year first (with the current session even when empty), then later years, then past years', () => {
    const g = planGroups(list, CUR);
    expect(g.thisYear.map((x) => x.session)).toEqual(['Autumn', 'Spring']);
    expect(g.thisYear[1].subs).toHaveLength(0);
    expect(g.later.map((y) => [y.year, y.sessions.map((x) => x.session), y.cp])).toEqual([[2027, ['Autumn', 'Spring'], 18], [2028, ['Autumn'], 6]]);
    expect(g.past.map((y) => [y.year, y.sessions.map((x) => x.session)])).toEqual([[2025, ['Autumn', 'Spring']]]);
    // Within a session: enrolled before planned, then by code.
    expect(g.later[0].sessions[1].subs.map((s) => s.code)).toEqual(['A', 'Z']);
  });
  it('lists the load of the current session and every later session with subjects', () => {
    const l = upcomingLoads(list, CUR);
    expect(l.map((x) => [x.year, x.session, x.cp, x.state.k])).toEqual([[2026, 'Spring', 0, 'ok'], [2027, 'Autumn', 6, 'ok'], [2027, 'Spring', 12, 'ok'], [2028, 'Autumn', 6, 'ok']]);
  });
});

describe('degree total syncs and restores', () => {
  it('merges to the newest degree setting', () => {
    const a = { degree: { total: 198, updatedAt: 1 } };
    const b = { degree: { total: 192, updatedAt: 2 } };
    expect(mergeSnapshots(a, b).degree.total).toBe(192);
    expect(mergeSnapshots(b, a).degree.total).toBe(192);
    expect(mergeSnapshots(a, {}).degree.total).toBe(198);
    expect(normalize({}).degree).toBeNull();
  });
  it('restore keeps or replaces it', () => {
    const l = { degree: { total: 198, updatedAt: 5 } };
    expect(planRestore(l, { degree: { total: 150, updatedAt: 1 } }, 'merge').degree.total).toBe(198);
    expect(planRestore(l, { degree: { total: 150, updatedAt: 1 } }, 'replace', 99).degree).toEqual({ total: 150, updatedAt: 99 });
    expect(planRestore(l, {}, 'replace').degree.total).toBe(198);
  });
});

describe('degree total in the database', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('is saved, read into the snapshot, written back and asks for a sync', async () => {
    let k = 0;
    store.setSyncHook(() => { k += 1; });
    await store.setDegreeTotal(192);
    expect(k).toBe(1);
    store.setSyncHook(null);
    const snap = await store.readSnapshot();
    expect(snap.degree.total).toBe(192);
    await db.meta.delete('degree');
    await store.writeSnapshot(snap);
    expect((await db.meta.get('degree')).total).toBe(192);
  });
});
