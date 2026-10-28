// Merge, backup/restore, pure edits and the database actions. Fake data only.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { mergeSnapshots, normalize, sameSnapshot } from '../merge.js';
import { buildBackup, parseBackup, planRestore, backupFileName } from '../backup.js';
import * as E from '../edit.js';
import { calc } from '../grades.js';
import { db } from '../db.js';
import * as store from '../store.js';
import { sampleSubjects } from '../sample.js';

const rec = (uid, updatedAt, extra = {}) => ({ uid, updatedAt, code: uid, components: [], ...extra });

describe('merge', () => {
  it('keeps the newest edit of each subject', () => {
    const m = mergeSnapshots({ subjects: [rec('a', 1, { code: 'old' }), rec('b', 5)] }, { subjects: [rec('a', 2, { code: 'new' }), rec('c', 1)] });
    expect(m.subjects.map((s) => `${s.uid}:${s.code}`)).toEqual(['a:new', 'b:b', 'c:c']);
  });
  it('delete marks win unless the subject was edited after the delete', () => {
    const m = mergeSnapshots({ subjects: [rec('a', 1), rec('b', 9)] }, { tombstones: { a: 5, b: 5 } });
    expect(m.subjects.map((s) => s.uid)).toEqual(['b']);
    expect(m.tombstones).toEqual({ a: 5, b: 5 });
  });
  it('takes the newest current session and is order-independent', () => {
    const a = { subjects: [rec('x', 3)], current: { year: 2026, session: 'Autumn', updatedAt: 1 } };
    const b = { subjects: [rec('x', 4)], current: { year: 2026, session: 'Spring', updatedAt: 2 } };
    expect(mergeSnapshots(a, b).current.session).toBe('Spring');
    expect(sameSnapshot(mergeSnapshots(a, b), mergeSnapshots(b, a))).toBe(true);
  });
  it('normalizes empty input', () => {
    expect(normalize(undefined)).toEqual({ version: 1, subjects: [], tasks: [], tombstones: {}, current: null });
  });
});

describe('backup', () => {
  const snap = { subjects: [rec('a', 1)], tombstones: { z: 3 }, current: { year: 2026, session: 'Spring', updatedAt: 1 } };
  it('round-trips through a file', () => {
    const text = JSON.stringify(buildBackup(snap, 100));
    const back = parseBackup(text);
    expect(back.savedAt).toBe(100);
    expect(sameSnapshot(back.snapshot, snap)).toBe(true);
  });
  it('refuses files that are not gradi backups, in plain words', () => {
    expect(() => parseBackup('nope')).toThrow(/isn’t a gradi backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'moni', backupVersion: 1, snapshot: {} }))).toThrow(/isn’t a gradi backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'gradi', backupVersion: 99, snapshot: {} }))).toThrow(/newer version/);
    expect(() => parseBackup(JSON.stringify({ app: 'gradi', backupVersion: 1, snapshot: { subjects: [{ code: 'x' }] } }))).toThrow(/damaged/);
  });
  it('merge restore adds and never deletes', () => {
    const r = planRestore({ subjects: [rec('a', 5), rec('b', 1)] }, { subjects: [rec('a', 1, { code: 'stale' }), rec('c', 1)] }, 'merge');
    expect(r.subjects.map((s) => `${s.uid}:${s.code}`)).toEqual(['a:a', 'b:b', 'c:c']);
  });
  it('merge restore brings back subjects deleted here (restoring means you want them)', () => {
    const r = planRestore({ subjects: [], tombstones: { a: 50 } }, { subjects: [rec('a', 1)] }, 'merge', 1000);
    expect(r.subjects.map((s) => `${s.uid}@${s.updatedAt}`)).toEqual(['a@1000']);
    expect(r.tombstones).toEqual({});
  });
  it('merge restore never deletes a subject you have here', () => {
    const r = planRestore({ subjects: [rec('a', 5)] }, { subjects: [], tombstones: { a: 99, z: 7 } }, 'merge');
    expect(r.subjects.map((s) => s.uid)).toEqual(['a']);
    expect(r.tombstones).toEqual({ z: 7 });
  });
  it('replace restore makes this device match the file, with delete marks for the rest', () => {
    const r = planRestore({ subjects: [rec('a', 5), rec('b', 1)], tombstones: { c: 50 } }, { subjects: [rec('c', 1)] }, 'replace', 1000);
    expect(r.subjects.map((s) => `${s.uid}@${s.updatedAt}`)).toEqual(['c@1000']);
    expect(r.tombstones).toEqual({ a: 1000, b: 1000 });
  });
  it('names the file with the Sydney date', () => {
    expect(backupFileName(new Date('2026-10-27T14:00:00Z'))).toBe('gradi-backup-2026-10-28.json');
  });
});

describe('edits', () => {
  const base = E.newSubject({ code: ' 48000_X ', year: '2026', session: 'Spring', cp: '6', target: '120' });
  it('make a clean new subject', () => {
    expect(base.code).toBe('48000_X');
    expect(base.year).toBe(2026);
    expect(base.target).toBe(100);
    expect(base.uid).toBeTruthy();
  });
  it('quick-add fills the weight that is left', () => {
    let s = E.addComponent(base, 'assignment');
    s = E.setCompField(s, s.components[0].id, 'weight', '30');
    s = E.addComponent(s, 'labs');
    s = E.addComponent(s, 'exam');
    expect(s.components.map((c) => `${c.name}:${c.weight}:${c.items.length}`)).toEqual(['Assignment 1:30:1', 'Labs:70:4', 'Final exam:10:1']);
    expect(base.components).toHaveLength(0); // original untouched
  });
  it('edit marks, parts and hurdles', () => {
    let s = E.addComponent(base, 'quizzes');
    const c = s.components[0];
    s = E.setPartField(s, c.id, c.items[0].id, 'score', '8');
    s = E.addPart(s, c.id);
    expect(s.components[0].items.map((i) => i.name)).toEqual(['Quiz 1', 'Quiz 2', 'Quiz 3', 'Quiz 4']);
    s = E.removePart(s, c.id, c.items[1].id);
    expect(s.components[0].items).toHaveLength(3);
    s = E.setCompField(s, c.id, 'hurdle', '');
    expect(s.components[0].hurdle).toBeNull();
    s = E.setCompField(s, c.id, 'hurdle', '50');
    expect(s.components[0].hurdle).toBe(50);
    expect(calc(s).comps[0].pct).toBe(80);
  });
  it('split and un-split keep the first mark', () => {
    let s = E.addComponent(base, 'assignment');
    const cid = s.components[0].id;
    s = E.setPartField(s, cid, s.components[0].items[0].id, 'score', '70');
    s = E.toggleSingle(s, cid);
    expect(s.components[0].single).toBe(false);
    expect(s.components[0].items.map((i) => `${i.name}:${i.score}`)).toEqual(['Part 1:70', 'Part 2:null']);
    s = E.toggleSingle(s, cid);
    expect(calc(s).comps[0].pct).toBe(70);
  });
  it('set official results and details', () => {
    let s = E.setDetails(base, { official: { grade: 'HD', mark: '91' }, cp: '3' });
    expect(s.official).toEqual({ grade: 'HD', mark: 91 });
    expect(s.cp).toBe(3);
    s = E.setDetails(s, { official: { grade: 'PASS', mark: '70' } });
    expect(s.official).toEqual({ grade: 'PASS', mark: null });
    s = E.setDetails(s, { official: { grade: '' } });
    expect(s.official).toBeNull();
    expect(E.toggleCount(base, 'countsWam').countsWam).toBe(false);
  });
});

describe('database actions', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('stamps updatedAt and leaves a delete mark', async () => {
    const s = await store.putSubject(E.newSubject({ code: 'A', year: 2026, session: 'Spring' }));
    expect(s.updatedAt).toBeGreaterThan(0);
    await store.updateSubject(s.uid, (x) => E.addComponent(x, 'exam'));
    expect((await db.subjects.get(s.uid)).components).toHaveLength(1);
    await store.deleteSubject(s.uid);
    const snap = await store.readSnapshot();
    expect(snap.subjects).toHaveLength(0);
    expect(snap.tombstones[s.uid]).toBeGreaterThan(0);
  });
  it('restores a backup with replace, and clears with delete marks', async () => {
    await store.addSubjects(sampleSubjects());
    const local = await store.readSnapshot();
    expect(local.subjects).toHaveLength(8);
    const file = { subjects: [rec('only', 1)], current: { year: 2025, session: 'Autumn', updatedAt: 1 } };
    await store.writeSnapshot(planRestore(local, file, 'replace'));
    const after = await store.readSnapshot();
    expect(after.subjects.map((s) => s.uid)).toEqual(['only']);
    expect(Object.keys(after.tombstones)).toHaveLength(8);
    expect((await store.getCurrent()).session).toBe('Autumn');
    await store.clearAll();
    expect((await store.readSnapshot()).tombstones.only).toBeGreaterThan(0);
  });
  it('calls the sync hook on writes', async () => {
    let n = 0;
    store.setSyncHook(() => { n += 1; });
    await store.setCurrent({ year: 2026, session: 'Spring' });
    await store.putSubject(E.newSubject({ code: 'B' }));
    expect(n).toBe(2);
    store.setSyncHook(null);
  });
});
