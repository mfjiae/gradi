// Import study tasks from text. Fake subjects only.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readDate, parseTaskLine, findSubject, planTaskImport, tasksToSave } from '../importTasks.js';
import { newTask } from '../tasks.js';
import { db } from '../db.js';
import * as store from '../store.js';

const TODAY = '2026-10-28';
const CUR = { year: 2026, session: 'Spring' };
const subA = {
  uid: 'sa', code: 'SAMPLE_A', year: 2026, session: 'Spring', cp: 6, components: [
    { id: 'c1', name: 'Labs', weight: 40, single: false, items: [{ id: 'i1', name: 'Lab 1', score: 9, max: 10 }, { id: 'i2', name: 'Lab 2', score: null, max: 10 }] },
    { id: 'c2', name: 'Final exam', weight: 60, single: true, items: [{ id: 'i3', name: 'Final exam', score: null, max: 100 }] },
  ],
};
const subB = { uid: 'sb', code: 'SAMPLE_B', year: 2026, session: 'Spring', cp: 6, components: [] };
const oldA = { ...subA, uid: 'sa-old', year: 2025, components: [] };
const SUBS = [oldA, subA, subB];
const plan = (text, tasks = []) => planTaskImport(text, { subjects: SUBS, tasks, current: CUR, today: TODAY, nowMs: 1000 });

describe('dates and times', () => {
  it('reads common date forms', () => {
    expect(readDate('3 Nov', TODAY)).toEqual({ due: '2026-11-03', time: null });
    expect(readDate('Tue 3 Nov, 11:00 PM', TODAY)).toEqual({ due: '2026-11-03', time: '23:00' });
    expect(readDate('3 November 2027 9:30', TODAY)).toEqual({ due: '2027-11-03', time: '09:30' });
    expect(readDate('2026-11-12 09:30', TODAY)).toEqual({ due: '2026-11-12', time: '09:30' });
    expect(readDate('12/11 11pm', TODAY)).toEqual({ due: '2026-11-12', time: '23:00' });
    expect(readDate('4 Nov 12am', TODAY)).toEqual({ due: '2026-11-04', time: '00:00' });
  });
  it('picks the year: this year, next year when long past', () => {
    expect(readDate('1 Oct', TODAY).due).toBe('2026-10-01'); // recently overdue stays this year
    expect(readDate('3 Mar', TODAY).due).toBe('2027-03-03');
  });
  it('rejects bad dates and times, ignores non-dates', () => {
    expect(readDate('31 Nov', TODAY).error).toMatch(/real date/);
    expect(readDate('3 Nov 25:00', TODAY).error).toMatch(/time/);
    expect(readDate('3 Nov 9', TODAY).error).toMatch(/time/);
    expect(readDate('hello', TODAY)).toBeNull();
  });
});

describe('lines', () => {
  it('reads every option in any order', () => {
    expect(parseTaskLine('SAMPLE_A | Lab 2 | important | link Lab 2 | 3 Nov 23:00 | note bring kit | repeat weekly | remind 2 days', TODAY)).toEqual({
      code: 'SAMPLE_A', title: 'Lab 2', important: true, link: 'Lab 2', due: '2026-11-03', time: '23:00', details: 'bring kit', repeat: 'weekly', remind: 2,
    });
    expect(parseTaskLine('SAMPLE_A | Read | remind 1 week | 3 Nov', TODAY).remind).toBe(7);
  });
  it('explains problems', () => {
    expect(parseTaskLine('| x', TODAY).error).toMatch(/subject code/);
    expect(parseTaskLine('SAMPLE_A', TODAY).error).toMatch(/task name/);
    expect(parseTaskLine('SAMPLE_A | x | soon', TODAY).error).toMatch(/Can't read “soon”/);
    expect(parseTaskLine('SAMPLE_A | x | 3 Nov | 4 Nov', TODAY).error).toMatch(/two dates/);
    expect(parseTaskLine('SAMPLE_A | x | remind 5 days', TODAY).error).toMatch(/Reminders/);
  });
  it('finds the subject: current session first, any case and spaces', () => {
    expect(findSubject('sample_a', SUBS, CUR).uid).toBe('sa');
    expect(findSubject('SAMPLE_A', SUBS, { year: 2027, session: 'Autumn' }).uid).toBe('sa'); // most recent
    expect(findSubject('NOPE', SUBS, CUR)).toBeNull();
  });
});

describe('plan', () => {
  it('adds new tasks with links, notes and countdown-ready exams', () => {
    const rows = plan(`# exams
SAMPLE_A | Final exam | 4 Nov 09:30 | link Final exam | note 2 h + reading

SAMPLE_A | Lab 2 report | 5 Nov 23:00 | link labs > lab 2
SAMPLE_B | Component 4 | 2 Nov 23:00`);
    expect(rows.map((r) => r.kind)).toEqual(['new', 'new', 'new']);
    const [exam, lab, b] = rows.map((r) => r.task);
    expect(exam).toMatchObject({ title: 'Final exam', subjectUid: 'sa', due: '2026-11-04', time: '09:30', link: { cid: 'c2', iid: 'i3' }, details: '2 h + reading', status: 'open' });
    expect(lab.link).toEqual({ cid: 'c1', iid: 'i2' });
    expect(b).toMatchObject({ subjectUid: 'sb', link: null, due: '2026-11-02' });
    expect(exam.order).toBeLessThan(lab.order);
  });
  it('warns about links it cannot find, still adds the task', () => {
    const rows = plan('SAMPLE_A | Lab 4 | 5 Nov | link Lab 4\nSAMPLE_B | x | link Quiz');
    expect(rows[0]).toMatchObject({ kind: 'new', task: { link: null } });
    expect(rows[0].warnings[0]).toMatch(/Couldn't find “Lab 4”/);
    expect(rows[1].warnings[0]).toMatch(/no assessments/);
  });
  it('a linked part that already has a mark is added as Done', () => {
    const r = plan('SAMPLE_A | Lab 1 | link Lab 1')[0];
    expect(r.task.status).toBe('done');
    expect(r.warnings[0]).toMatch(/Done/);
  });
  it('uses the part name when only a link is given', () => {
    expect(plan('SAMPLE_A |  | link Lab 2')[0].task.title).toBe('Lab 2');
  });
  it('skips bad lines, unknown subjects and repeats in the same paste', () => {
    const rows = plan('NOPE | x | 3 Nov\nSAMPLE_A | x | soon\nSAMPLE_A | Read\nSAMPLE_A | read');
    expect(rows.map((r) => r.kind)).toEqual(['error', 'error', 'new', 'error']);
    expect(rows[0].error).toMatch(/No subject “NOPE”/);
    expect(rows[3].error).toMatch(/twice/);
    expect(tasksToSave(rows)).toHaveLength(1);
  });
  it('updates a task with the same name, changes only what is given, leaves Done alone', () => {
    const open = { ...newTask({ title: 'Final exam', subjectUid: 'sa', due: '2026-11-20', time: '14:00', details: 'old', important: true }, 1), uid: 't1', updatedAt: 1 };
    const done = { ...newTask({ title: 'Lab 2', subjectUid: 'sa', status: 'done' }, 1), uid: 't2' };
    const rows = plan('SAMPLE_A | final EXAM | 4 Nov 09:30 | link Final exam\nSAMPLE_A | Lab 2 | 9 Nov', [open, done]);
    expect(rows[0].kind).toBe('update');
    expect(rows[0].task).toMatchObject({ uid: 't1', title: 'Final exam', due: '2026-11-04', time: '09:30', details: 'old', important: true, link: { cid: 'c2', iid: 'i3' } });
    expect(rows[0].changes).toEqual(['due', 'time', 'link']);
    expect(rows[1].kind).toBe('done');
    expect(tasksToSave(rows).map((t) => t.uid)).toEqual(['t1']);
    // Pasting the same again changes nothing.
    const again = plan('SAMPLE_A | Final exam | 4 Nov 09:30 | link Final exam', [rows[0].task]);
    expect(again[0].kind).toBe('same');
  });
  it('repeat and reminders need a due date', () => {
    const r = plan('SAMPLE_B | Read | repeat weekly')[0];
    expect(r.task.repeat).toBeNull();
    expect(r.warnings[0]).toMatch(/due date/);
  });
});

describe('store', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('saves new and updated tasks and clears old delete marks', async () => {
    await db.tombstones.put({ key: 'x1', at: 1 });
    const n = await store.importTasks([{ ...newTask({ title: 'A', subjectUid: 'sb' }, 1), uid: 'x1' }]);
    expect(n).toBe(1);
    const t = await db.tasks.get('x1');
    expect(t.updatedAt).toBeGreaterThan(1);
    expect(await db.tombstones.get('x1')).toBeUndefined();
    expect(await store.importTasks([])).toBe(0);
  });
});
