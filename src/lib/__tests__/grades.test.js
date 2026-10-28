// Grade maths tests. Fake subjects only: real grades never go in this public repo.
import { describe, it, expect } from 'vitest';
import {
  band, calc, needed, result, bandOf, overall, ceil1, fmt, num, groupSessions, guessSession, isCurrent,
  pendingAcross, defaultWhatIf, subBand, yearOptions, calendarYear,
} from '../grades.js';

let n = 0;
const id = () => `t${++n}`;
// comp('Labs', 20, [[4, 5], [18, 20]]) -> split component; one item -> single mark
const comp = (name, weight, items, o = {}) => ({
  id: id(), name, weight, single: items.length === 1 && !o.group, hurdle: o.hurdle ?? null,
  items: items.map(([score, max], i) => ({ id: id(), name: `Part ${i + 1}`, score, max, w: null })),
});
const subj = (o) => ({ uid: id(), code: 'FAKE', name: '', year: 2026, session: 'Spring', cp: 6, target: 85, components: [], official: null, ...o });

describe('bands', () => {
  it('use the whole-number mark', () => {
    expect(band(84.4).k).toBe('D');
    expect(band(84.5).k).toBe('HD');
    expect(band(74.5).k).toBe('D');
    expect(band(64.4).k).toBe('P');
    expect(band(49.5).k).toBe('P');
    expect(band(49.4).k).toBe('F');
    expect(band(100).gp).toBe(7);
    expect(band(0).gp).toBe(0);
  });
});

describe('calc', () => {
  const s = subj({ target: 85, components: [comp('A1', 30, [[24, 30]]), comp('A2', 40, [[30, 40]]), comp('Exam', 30, [[null, 100]])] });
  it('banks points, averages what is marked, and works out what is left', () => {
    const r = calc(s);
    expect(r.W).toBe(100);
    expect(r.banked).toBeCloseTo(54, 9);
    expect(r.gradedPts).toBeCloseTo(70, 9);
    expect(r.avg).toBeCloseTo(77.142857, 5);
    expect(r.remaining).toBeCloseTo(30, 9);
    expect(r.best).toBeCloseTo(84, 9);
    expect(r.state).toBe('out'); // needs 103.3%
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].pts).toBeCloseTo(30, 9);
  });
  it('gives the mark needed, rounded up', () => {
    const r = calc({ ...s, target: 75 });
    expect(r.state).toBe('need');
    expect(r.req).toBeCloseTo(70, 9);
    const nd = needed(r);
    expect(nd.pct).toBe(70);
    expect(nd.parts[0].score).toBe(70);
    const r2 = calc({ ...s, target: 76 }); // (76-54)/30 = 73.333..
    expect(needed(r2).pct).toBe(73.4);
  });
  it('scales weights that do not add to 100', () => {
    const r = calc(subj({ components: [comp('A', 20, [[10, 20]]), comp('B', 20, [[null, 100]])] }));
    expect(r.W).toBe(40);
    expect(r.banked).toBeCloseTo(25, 9);
    expect(r.remaining).toBeCloseTo(50, 9);
    expect(r.avg).toBeCloseTo(50, 9);
  });
  it('weights parts by points, the way Canvas does', () => {
    const r = calc(subj({ components: [comp('Labs', 100, [[4, 5], [18, 20]], { group: true })] }));
    expect(r.comps[0].pct).toBeCloseTo(88, 9); // 22/25, not (80+90)/2 = 85
  });
  it('reproduces a points-weighted fake subject (76)', () => {
    const r = calc(subj({ components: [
      comp('Task 1', 25, [[4, 5], [18, 20]], { group: true }),
      comp('Task 2', 45, [[9, 10], [24, 35]], { group: true }),
      comp('Task 3', 30, [[50, 70], [20, 30]], { group: true }),
    ] }));
    expect(r.banked).toBeCloseTo(76, 9);
    expect(r.state).toBe('missed');
    expect(result(subj({ components: [comp('X', 100, [[76, 100]])] })).grade).toBe('D');
  });
  it('splits unmarked parts into their share of points', () => {
    const r = calc(subj({ components: [comp('Labs', 20, [[9, 10], [null, 10]], { group: true }), comp('Exam', 80, [[null, 100]])] }));
    expect(r.pending.map((p) => p.pts)).toEqual([10, 80]);
    expect(r.pending[0].label).toBe('Labs · Part 2');
  });
  it('flags secured and missed', () => {
    expect(calc(subj({ target: 50, components: [comp('A', 60, [[55, 60]]), comp('B', 40, [[null, 100]])] })).state).toBe('secured');
    expect(calc(subj({ target: 85, components: [comp('A', 100, [[80, 100]])] })).state).toBe('missed');
    expect(calc(subj()).state).toBe('empty');
  });
  it('treats blank and zero marks differently', () => {
    const r = calc(subj({ components: [comp('A', 50, [[0, 10]]), comp('B', 50, [[null, 10]])] }));
    expect(r.gradedPts).toBeCloseTo(50, 9);
    expect(r.avg).toBe(0);
  });
  it('projects what-if marks', () => {
    const r = calc(subj({ components: [comp('A', 50, [[40, 50]]), comp('B', 50, [[null, 100]])] }), () => 60);
    expect(r.proj).toBeCloseTo(40 + 30, 9);
  });
});

describe('hurdles', () => {
  it('fail the subject when fully marked below the hurdle, whatever the total', () => {
    const s = subj({ components: [comp('Assignments', 70, [[70, 70]]), comp('Exam', 30, [[12, 30]], { hurdle: 50 })] });
    const r = calc(s);
    expect(r.banked).toBeCloseTo(82, 9);
    expect(r.hurdleFail).toBeTruthy();
    expect(subBand(r).k).toBe('F');
    expect(result(s).gp).toBe(0);
  });
  it('are only "at risk" while parts are still unmarked', () => {
    const r = calc(subj({ components: [comp('Quizzes', 100, [[2, 10], [null, 10]], { group: true, hurdle: 40 })] }));
    expect(r.comps[0].hs).toBe('risk');
    expect(r.hurdleFail).toBeNull();
  });
  it('pass when met', () => {
    expect(calc(subj({ components: [comp('Exam', 100, [[50, 100]], { hurdle: 50 })] })).comps[0].hs).toBe('ok');
  });
});

describe('official results', () => {
  it('win over components', () => {
    const s = subj({ components: [comp('A', 100, [[60, 100]])], official: { grade: 'HD', mark: 90 } });
    expect(result(s)).toEqual({ grade: 'HD', gp: 7, mark: 90, official: true });
    expect(bandOf(s).k).toBe('HD');
  });
  it('Pass, not graded has no grade points', () => {
    const s = subj({ cp: 3, official: { grade: 'PASS', mark: null } });
    expect(result(s).gp).toBeNull();
    expect(bandOf(s).k).toBe('Pass');
  });
});

describe('overall GPA and WAM', () => {
  const done = [
    subj({ official: { grade: 'HD', mark: 90 } }),
    subj({ official: { grade: 'D', mark: 76 } }),
    subj({ official: { grade: 'C', mark: null } }), // grade only
    subj({ cp: 3, official: { grade: 'PASS', mark: null } }),
    subj({ official: { grade: 'F', mark: 40 } }),
  ];
  it('weights grade points and marks by credit points', () => {
    const o = overall(done);
    expect(o.gpa).toBeCloseTo((7 + 6 + 5 + 0) / 4, 9); // PASS left out
    expect(o.avg).toBeCloseTo((90 + 76 + 40) / 3, 9); // no-mark C and PASS left out
    expect(o.gained).toBe(21); // F gains nothing; PASS gains its 3
  });
  it('uses credit points as the weight', () => {
    const o = overall([subj({ cp: 12, official: { grade: 'HD', mark: 90 } }), subj({ cp: 6, official: { grade: 'P', mark: 60 } })]);
    expect(o.gpa).toBeCloseTo((12 * 7 + 6 * 4) / 18, 9);
    expect(o.avg).toBeCloseTo((12 * 90 + 6 * 60) / 18, 9);
  });
  it('respects the counts-in-GPA and counts-in-WAM switches', () => {
    const o = overall([subj({ official: { grade: 'HD', mark: 86 }, countsWam: false }), subj({ official: { grade: 'D', mark: 80 } }), subj({ official: { grade: 'P', mark: 55 }, countsGpa: false })]);
    expect(o.avg).toBeCloseTo((80 + 55) / 2, 9);
    expect(o.gpa).toBeCloseTo((7 + 6) / 2, 9);
  });
  it('onlyOfficial skips unfinished subjects', () => {
    const cur = subj({ components: [comp('A', 100, [[50, 100]])] });
    const o = overall([...done, cur], { onlyOfficial: true });
    expect(o.gpa).toBeCloseTo(18 / 4, 9);
  });
  it('current subjects count at their average so far (rounded mark)', () => {
    const o = overall([subj({ components: [comp('A', 50, [[42.3, 50]]), comp('B', 50, [[null, 100]])] })]);
    expect(o.avg).toBe(85); // 84.6 -> 85
    expect(o.gpa).toBe(7);
  });
  it('GPA if every target is hit counts subjects with no marks yet', () => {
    const o = overall([subj({ official: { grade: 'HD', mark: 90 } }), subj({ target: 75 })]);
    expect(o.gpaTarget).toBeCloseTo(6.5, 9);
    expect(o.gpa).toBe(7); // the empty subject has no grade yet
  });
  it('projects GPA from what-if marks', () => {
    const s = subj({ components: [comp('A', 50, [[40, 50]]), comp('B', 50, [[null, 100]])] });
    expect(overall([s], { assumeFor: () => () => 100 }).gpaProj).toBe(7); // 90
    expect(overall([s], { assumeFor: () => () => 0 }).gpaProj).toBe(0); // 40 -> F
  });
  it('is empty-safe', () => {
    expect(overall([])).toEqual({ gpa: null, avg: null, gpaTarget: null, gpaProj: null, gained: 0 });
  });
});

describe('sessions and helpers', () => {
  it('groups newest session first', () => {
    const g = groupSessions([
      subj({ year: 2025, session: 'Autumn' }), subj({ year: 2026, session: 'Spring' }),
      subj({ year: 2025, session: 'Summer' }), subj({ year: 2026, session: 'Autumn' }), subj({ year: 2025, session: 'Spring' }),
    ]);
    expect(g.map((x) => `${x.session} ${x.year}`)).toEqual(['Spring 2026', 'Autumn 2026', 'Summer 2025', 'Spring 2025', 'Autumn 2025']);
  });
  it('guesses the session from the date', () => {
    expect(guessSession(new Date(2026, 9, 28))).toEqual({ year: 2026, session: 'Spring' });
    expect(guessSession(new Date(2026, 2, 1))).toEqual({ year: 2026, session: 'Autumn' });
    expect(guessSession(new Date(2026, 11, 5))).toEqual({ year: 2026, session: 'Summer' });
    expect(guessSession(new Date(2027, 0, 5))).toEqual({ year: 2026, session: 'Summer' });
  });
  it('knows the current session', () => {
    expect(isCurrent(subj(), { year: 2026, session: 'Spring' })).toBe(true);
    expect(isCurrent(subj(), { year: 2026, session: 'Autumn' })).toBe(false);
  });
  it('lists marks still to come, biggest first', () => {
    const a = subj({ code: 'A', components: [comp('Exam', 50, [[null, 100]]), comp('Quiz', 10, [[null, 10]]), comp('A1', 40, [[30, 40]])] });
    const b = subj({ code: 'B', components: [comp('Exam', 40, [[null, 100]]), comp('A1', 60, [[50, 60]])] });
    expect(pendingAcross([a, b]).map((p) => `${p.code} ${p.pts}`)).toEqual(['A 50', 'B 40', 'A 10']);
    expect(pendingAcross([a, b], 1)).toHaveLength(1);
  });
  it('rounds and parses', () => {
    expect(ceil1(84.4)).toBe(84.4);
    expect(ceil1(66.6667)).toBe(66.7);
    expect(fmt(86)).toBe('86');
    expect(fmt(74.66)).toBe('74.7');
    expect(fmt(6.25, 2)).toBe('6.25');
    expect(fmt(null)).toBe('—');
    expect(num('')).toBeNull();
    expect(num(' 12.5 ')).toBe(12.5);
    expect(num('abc')).toBeNull();
    expect(defaultWhatIf({ avg: null })).toBe(70);
    expect(defaultWhatIf({ avg: 77.6 })).toBe(78);
  });
});

describe('year options', () => {
  it('start at 2025 and end at the current calendar year', () => {
    expect(yearOptions([], new Date('2026-10-28T03:00:00Z'))).toEqual([2025, 2026]);
    expect(yearOptions([], new Date('2025-06-01T03:00:00Z'))).toEqual([2025]);
  });
  it('add a new year by themselves on 1 January (Sydney time)', () => {
    expect(yearOptions([], new Date('2026-12-31T13:00:00Z'))).toEqual([2025, 2026, 2027]); // 1 Jan 2027, 00:00 Sydney
    expect(yearOptions([], new Date('2026-12-31T12:59:00Z'))).toEqual([2025, 2026]); // 31 Dec 2026, 23:59 Sydney
    expect(calendarYear(new Date('2027-07-01T00:00:00Z'))).toBe(2027);
  });
  it('still list years outside the range that subjects use, without duplicates', () => {
    expect(yearOptions([2024, 2026, 2030, 2026, 'x', 12.5], new Date('2026-10-28T03:00:00Z'))).toEqual([2024, 2025, 2026, 2030]);
  });
});
