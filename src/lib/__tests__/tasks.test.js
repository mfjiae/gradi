// Study tasks: pure logic, database actions, merge/backup with tasks, and the v1 -> v2 database upgrade.
// Fake subjects only.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import * as T from '../tasks.js';
import * as E from '../edit.js';
import { db, applySchema } from '../db.js';
import * as store from '../store.js';
import { mergeSnapshots, sameSnapshot } from '../merge.js';
import { buildBackup, parseBackup, planRestore } from '../backup.js';
import { parseImport, planImport } from '../importText.js';

const NOW = { date: '2026-10-28', time: '19:00' };

describe('dates', () => {
  it('reads the Sydney date and time', () => {
    expect(T.sydneyNow(new Date('2026-10-28T08:05:00Z'))).toEqual({ date: '2026-10-28', time: '19:05' });
    expect(T.sydneyNow(new Date('2026-10-28T13:30:00Z'))).toEqual({ date: '2026-10-29', time: '00:30' });
  });
  it('adds days and months, counts days, labels dates', () => {
    expect(T.addDays('2026-10-28', 5)).toBe('2026-11-02');
    expect(T.addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(T.daysBetween('2026-10-28', '2026-11-23')).toBe(26);
    expect(T.dateLabel('2026-11-02')).toBe('Mon 2 Nov');
    expect(T.timeLabel('23:00')).toBe('11:00 PM');
    expect(T.timeLabel('16:00', true)).toBe('4pm');
    expect(T.timeLabel('00:30', true)).toBe('12:30am');
  });
  it('builds month weeks starting Monday', () => {
    const w = T.monthWeeks('2026-10-15');
    expect(w[0][0]).toBe('2026-09-28');
    expect(w.at(-1).at(-1)).toBe('2026-11-01');
    expect(w).toHaveLength(5);
  });
});

describe('task states', () => {
  const t = (f) => T.newTask({ title: 'X', subjectUid: 's', ...f }, 1000);
  it('cleans new tasks: time, repeat and reminder need a due date', () => {
    expect(t({ time: '23:00', repeat: 'weekly', remind: 2 })).toMatchObject({ due: null, time: null, repeat: null, remind: null, status: 'open', order: 1000 });
    expect(t({ due: '2026-11-02', time: '23:00', repeat: 'weekly', remind: '1' })).toMatchObject({ time: '23:00', repeat: 'weekly', remind: 1 });
    expect(t({ due: '2026-11-02', time: '25:00' }).time).toBeNull();
    expect(t({ status: 'done' }).doneAt).toBe(1000);
  });
  it('works out overdue and the relative text', () => {
    expect(T.isOverdue(t({ due: '2026-10-27' }), NOW)).toBe(true);
    expect(T.relText(t({ due: '2026-10-26' }), NOW)).toBe('2 days overdue');
    expect(T.isOverdue(t({ due: '2026-10-28' }), NOW)).toBe(false);
    expect(T.relText(t({ due: '2026-10-28', time: '18:00' }), NOW)).toBe('Overdue');
    expect(T.relText(t({ due: '2026-10-28', time: '23:00' }), NOW)).toBe('Today');
    expect(T.relText(t({ due: '2026-10-29' }), NOW)).toBe('Tomorrow');
    expect(T.relText(t({ due: '2026-11-02' }), NOW)).toBe('in 5 days');
    expect(T.relText(t({}), NOW)).toBe('No date yet');
    expect(T.isOverdue(t({ due: '2026-10-01', status: 'done' }), NOW)).toBe(false);
  });
  it('a repeating task gives the next one when ticked Done', () => {
    const r = T.completeTask(t({ due: '2026-10-28', repeat: 'weekly', link: { cid: 'c', iid: 'i' } }), 5000);
    expect(r.task).toMatchObject({ status: 'done', doneAt: 5000 });
    expect(r.next).toMatchObject({ status: 'open', due: '2026-11-04', link: null, doneAt: null });
    expect(r.next.uid).not.toBe(r.task.uid);
    expect(T.completeTask(t({ due: '2026-10-28' }), 5000).next).toBeNull();
    expect(T.nextDue('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('edits keep uid, order and created time, and set or clear doneAt', () => {
    const a = t({ due: '2026-11-02' });
    const b = T.setTaskFields(a, { status: 'done', title: ' Y ' }, 7000);
    expect(b).toMatchObject({ uid: a.uid, order: 1000, createdAt: 1000, status: 'done', doneAt: 7000, title: 'Y' });
    expect(T.setTaskFields(b, { status: 'open' }, 8000).doneAt).toBeNull();
    expect(T.setTaskFields(a, { due: null }).time).toBeNull();
  });
});

describe('lists', () => {
  const mk = (title, f = {}) => T.newTask({ title, subjectUid: 'a', ...f }, f.order ?? 1);
  const tasks = [
    mk('late', { due: '2026-10-27' }),
    mk('soon', { due: '2026-10-31', status: 'progress' }),
    mk('later', { due: '2026-11-20', important: true }),
    mk('undated'),
    mk('star', { due: '2026-11-02', important: true }),
    mk('finished', { due: '2026-10-20', status: 'done' }),
  ];
  const ids = (g) => g.map((x) => `${x.id}:${x.items.map((i) => i.title).join(',')}`);
  it('groups by status with overdue first and Done last', () => {
    expect(ids(T.groupTasks(tasks, { now: NOW }))).toEqual(['overdue:late', 'open:star,later,undated', 'progress:soon', 'done:finished']);
  });
  it('groups by due date', () => {
    expect(ids(T.groupTasks(tasks, { group: 'due', now: NOW }))).toEqual(['overdue:late', 'week:soon,star', 'later:later', 'nodate:undated', 'done:finished']);
  });
  it('sorts by importance, name and manual order', () => {
    expect(T.sortTasks(tasks, 'important').slice(0, 2).map((x) => x.title)).toEqual(['star', 'later']);
    expect(T.sortTasks(tasks, 'title')[0].title).toBe('finished');
    const m = [mk('b', { order: 2 }), mk('a', { order: 1 })];
    expect(T.sortTasks(m, 'manual').map((x) => x.title)).toEqual(['a', 'b']);
  });
  it('filters by subject and importance', () => {
    expect(T.filterTasks(tasks, { important: true }).map((x) => x.title)).toEqual(['later', 'star']);
    expect(T.filterTasks(tasks, { subject: 'zzz' })).toEqual([]);
  });
  it('Due soon: overdue, next 7 days, or inside the reminder window', () => {
    const extra = mk('far, reminds', { due: '2026-11-20', remind: 7 });
    const far = mk('far', { due: '2026-11-21', remind: 1 });
    const r = T.dueSoon([...tasks, extra, far], { date: '2026-11-13', time: '09:00' });
    expect(r.items.map((x) => x.title)).toEqual(['late', 'soon', 'star', 'later', 'far, reminds']);
    expect(r.undated).toBe(1);
  });
  it('exam countdowns by name or by a link to an exam', () => {
    const s = { uid: 'a', code: 'FAKE', components: [{ id: 'c', name: 'Final exam', single: true, items: [{ id: 'i', score: null, max: 100 }] }] };
    const list = [mk('Final exam', { due: '2026-11-23' }), mk('Big test', { due: '2026-11-26', link: { cid: 'c', iid: 'i' } }), mk('Lab', { due: '2026-11-01' }), mk('Old exam', { due: '2026-10-01' })];
    expect(T.countdowns(list, [s], NOW).map((x) => `${x.code} ${x.title} ${x.days}`)).toEqual(['FAKE Final exam 26', 'FAKE Big test 29']);
    expect(T.daysText(0)).toBe('Today');
  });
});

describe('links to assessments', () => {
  let s = E.addComponent(E.newSubject({ code: 'FAKE', year: 2026, session: 'Spring' }), 'quizzes');
  s = E.addComponent(s, 'exam');
  const [q, ex] = s.components;
  it('lists what can be linked and finds new parts', () => {
    expect(T.linkOptions(s).map((g) => `${g.name}:${g.parts.map((p) => p.label).join('/')}`)).toEqual(['Quizzes:Quiz 1/Quiz 2/Quiz 3', 'Final exam:Final exam']);
    const more = E.addPart(s, q.id);
    expect(T.newParts(s, more).map((p) => p.title)).toEqual(['Quiz 4']);
    expect(T.newParts(E.newSubject({ code: 'X' }), s).map((p) => `${p.comp}/${p.title}`)).toEqual(['Quizzes/Quiz 1', 'Quizzes/Quiz 2', 'Quizzes/Quiz 3', 'Final exam/Final exam']);
    expect(T.linkLabel(s, { cid: q.id, iid: q.items[1].id })).toBe('Quizzes › Quiz 2');
    expect(T.linkLabel(s, { cid: ex.id, iid: ex.items[0].id })).toBe('Final exam');
  });
  it('a new mark ticks the linked task Done; renames follow; removed parts drop the link', () => {
    const task = (iid, f = {}) => T.newTask({ title: q.items.find((i) => i.id === iid).name, subjectUid: s.uid, link: { cid: q.id, iid }, ...f }, 1);
    const tasks = [task(q.items[0].id), task(q.items[1].id, { title: 'My own name' }), task(q.items[2].id)];
    let n = E.setPartField(s, q.id, q.items[0].id, 'score', '8');
    n = E.setPartField(n, q.id, q.items[1].id, 'name', 'Quiz B');
    n = E.removePart(n, q.id, q.items[2].id);
    const { updates } = T.linkedTaskChanges(s, n, tasks, 99);
    // "My own name" isn't touched: it was renamed by hand, so the part rename doesn't change it.
    expect(updates.map((u) => `${u.title}:${u.status}:${u.link ? 'linked' : 'unlinked'}`)).toEqual(['Quiz 1:done:linked', 'Quiz 3:open:unlinked']);
    // the renamed part only renames a task that still had the old name
    const r2 = T.linkedTaskChanges(s, E.setPartField(s, q.id, q.items[0].id, 'name', 'Quiz A'), [task(q.items[0].id)], 99);
    expect(r2.updates[0].title).toBe('Quiz A');
    // a mark that was already there doesn't re-tick a reopened task
    const marked = E.setPartField(s, q.id, q.items[0].id, 'score', '8');
    expect(T.linkedTaskChanges(marked, E.setPartField(marked, q.id, q.items[0].id, 'name', 'Quiz 1'), [task(q.items[0].id)], 99).updates).toEqual([]);
  });
  it('import keeps assessment and part ids, so links survive a re-paste', () => {
    const saved = { ...E.newSubject({ code: 'FAKE', year: 2026, session: 'Spring' }), components: parseImport('X | Spring 2026\nQuizzes | 40% | Quiz 1=-/10, Quiz 2=-/10\nExam | 60% | -/100').blocks[0].components };
    const [u] = planImport(parseImport('FAKE | Spring 2026\nQuizzes | 40% | Quiz 1=8/10, Quiz 2=-/10, Quiz 3=-/10\nExam | 60% | -/100').blocks, [saved]);
    const [qa, eb] = saved.components;
    const [qn, en] = u.subject.components;
    expect(qn.id).toBe(qa.id);
    expect(qn.items.slice(0, 2).map((i) => i.id)).toEqual(qa.items.map((i) => i.id));
    expect(qn.items[2].id).not.toBe(qa.items[1].id);
    expect(en.id).toBe(eb.id);
    expect(en.items[0].id).toBe(eb.items[0].id);
  });
});

describe('merge and backup with tasks', () => {
  const task = (uid, updatedAt, title = uid) => ({ uid, updatedAt, title, subjectUid: 's' });
  it('newest task edit wins, delete marks remove tasks, old snapshots without tasks are fine', () => {
    const m = mergeSnapshots({ tasks: [task('a', 1, 'old'), task('b', 1)], tombstones: { b: 5 } }, { tasks: [task('a', 2, 'new')] });
    expect(m.tasks.map((t) => `${t.uid}:${t.title}`)).toEqual(['a:new']);
    expect(sameSnapshot({ subjects: [] }, { subjects: [], tasks: [] })).toBe(true);
  });
  it('backups carry tasks; restore merge adds them and replace matches the file', () => {
    const file = parseBackup(JSON.stringify(buildBackup({ tasks: [task('t1', 1)] }))).snapshot;
    expect(file.tasks.map((t) => t.uid)).toEqual(['t1']);
    expect(() => parseBackup(JSON.stringify({ app: 'gradi', backupVersion: 1, snapshot: { tasks: [{}] } }))).toThrow(/damaged/);
    const merged = planRestore({ tasks: [task('t2', 1)] }, file, 'merge', 100);
    expect(merged.tasks.map((t) => t.uid)).toEqual(['t1', 't2']);
    const replaced = planRestore({ tasks: [task('t2', 1)] }, file, 'replace', 100);
    expect(replaced.tasks.map((t) => `${t.uid}@${t.updatedAt}`)).toEqual(['t1@100']);
    expect(replaced.tombstones).toEqual({ t2: 100 });
  });
});

describe('database actions for tasks', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  const subjectWithQuiz = async () => {
    const s = await store.putSubject(E.addComponent(E.newSubject({ code: 'FAKE', year: 2026, session: 'Spring' }), 'quizzes'));
    return { s, q: s.components[0] };
  };

  it('saves, ticks Done (adding the next repeat), deletes with a mark', async () => {
    const { s } = await subjectWithQuiz();
    const t = await store.putTask(T.newTask({ title: 'Read notes', subjectUid: s.uid, due: '2026-10-29', repeat: 'weekly' }));
    expect(t.updatedAt).toBeGreaterThan(0);
    await store.setTaskStatus(t.uid, 'done');
    const all = await db.tasks.toArray();
    expect(all.map((x) => `${x.status}:${x.due}`).sort()).toEqual(['done:2026-10-29', 'open:2026-11-05']);
    await store.deleteTask(t.uid);
    const snap = await store.readSnapshot();
    expect(snap.tasks).toHaveLength(1);
    expect(snap.tombstones[t.uid]).toBeGreaterThan(0);
  });

  it('entering a mark ticks the linked task Done', async () => {
    const { s, q } = await subjectWithQuiz();
    const t = await store.putTask(T.newTask({ title: 'Quiz 1', subjectUid: s.uid, due: '2026-10-30', link: { cid: q.id, iid: q.items[0].id } }));
    await store.updateSubject(s.uid, (x) => E.setPartField(x, q.id, q.items[0].id, 'score', '9'));
    expect((await db.tasks.get(t.uid)).status).toBe('done');
  });

  it('deleting a subject deletes its tasks; clear everything clears tasks too', async () => {
    const { s } = await subjectWithQuiz();
    const t = await store.putTask(T.newTask({ title: 'x', subjectUid: s.uid }));
    await store.deleteSubject(s.uid);
    expect(await db.tasks.count()).toBe(0);
    expect((await store.readSnapshot()).tombstones[t.uid]).toBeGreaterThan(0);
    const b = await subjectWithQuiz();
    await store.putTask(T.newTask({ title: 'y', subjectUid: b.s.uid }));
    await store.clearAll();
    expect(await db.tasks.count()).toBe(0);
  });

  it('manual order and restore with tasks', async () => {
    const { s } = await subjectWithQuiz();
    const a = await store.putTask(T.newTask({ title: 'a', subjectUid: s.uid, order: 10 }));
    const b = await store.putTask(T.newTask({ title: 'b', subjectUid: s.uid, order: 20 }));
    await store.reorderTasks([b.uid, a.uid]);
    expect(T.sortTasks(await db.tasks.toArray(), 'manual').map((x) => x.title)).toEqual(['b', 'a']);
    const snap = await store.readSnapshot();
    await store.writeSnapshot(planRestore(snap, { subjects: [], tasks: [] }, 'replace'));
    expect(await db.tasks.count()).toBe(0);
  });
});

describe('database upgrade v1 -> v2', () => {
  it('keeps subjects, delete marks and meta, and adds the tasks table', async () => {
    const name = 'gradi-upgrade-test';
    await Dexie.delete(name);
    const v1 = new Dexie(name);
    v1.version(1).stores({ subjects: 'uid, year, session', tombstones: 'key', meta: 'key' });
    await v1.open();
    await v1.subjects.put({ uid: 'u1', code: 'FAKE_A', year: 2026, session: 'Spring', components: [] });
    await v1.tombstones.put({ key: 'gone', at: 5 });
    await v1.meta.put({ key: 'current', year: 2026, session: 'Spring', updatedAt: 1 });
    v1.close();

    const v2 = applySchema(new Dexie(name));
    await v2.open();
    expect(v2.verno).toBe(2);
    expect((await v2.subjects.get('u1')).code).toBe('FAKE_A');
    expect((await v2.tombstones.get('gone')).at).toBe(5);
    expect((await v2.meta.get('current')).session).toBe('Spring');
    await v2.tasks.put({ uid: 't1', subjectUid: 'u1', title: 'x' });
    expect(await v2.tasks.where('subjectUid').equals('u1').count()).toBe(1);
    v2.close();
    await Dexie.delete(name);
  });
});
