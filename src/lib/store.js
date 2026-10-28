// Database actions. Every write stamps updatedAt and calls requestSync() (sync.js hooks in).
import { db } from './db.js';
import { normalize } from './merge.js';
import { guessSession } from './grades.js';
import { linkedTaskChanges, completeTask, setTaskFields } from './tasks.js';

let syncHook = null;
export const setSyncHook = (fn) => { syncHook = fn; };
export const requestSync = () => { try { syncHook?.(); } catch { /* sync is best-effort */ } };

const stamp = (r, now = Date.now()) => ({ ...r, updatedAt: now });

export async function getCurrent() {
  const row = await db.meta.get('current');
  return row ? { year: row.year, session: row.session, updatedAt: row.updatedAt } : { ...guessSession(), updatedAt: 0 };
}

export async function setCurrent({ year, session }) {
  await db.meta.put({ key: 'current', year, session, updatedAt: Date.now() });
  requestSync();
}

// Tasks linked to a subject follow its marks: a new mark ticks the task Done, a renamed part renames it,
// a removed part drops the link. Runs inside the caller's transaction.
async function followMarks(oldS, newS, now) {
  if (!oldS) return;
  const linked = await db.tasks.where('subjectUid').equals(newS.uid).toArray();
  if (!linked.length) return;
  const { updates, adds } = linkedTaskChanges(oldS, newS, linked, now);
  if (updates.length || adds.length) await db.tasks.bulkPut([...updates, ...adds].map((t) => stamp(t, now)));
}

export async function putSubject(s) {
  const now = Date.now();
  const r = stamp(s, now);
  await db.transaction('rw', db.subjects, db.tombstones, db.tasks, async () => {
    const old = await db.subjects.get(r.uid);
    await db.subjects.put(r);
    await db.tombstones.delete(r.uid); // an edit after a delete brings it back
    await followMarks(old, r, now);
  });
  requestSync();
  return r;
}

// Read, change with a pure edit (edit.js), save. Skips the save when nothing changed.
export async function updateSubject(uid, fn) {
  const s = await db.subjects.get(uid);
  if (!s) return null;
  const next = fn(s);
  if (!next || JSON.stringify(next) === JSON.stringify(s)) return s;
  return putSubject(next);
}

// Deleting a subject also deletes its tasks (each leaves a delete mark).
export async function deleteSubject(uid) {
  const now = Date.now();
  await db.transaction('rw', db.subjects, db.tombstones, db.tasks, async () => {
    const tids = await db.tasks.where('subjectUid').equals(uid).primaryKeys();
    await db.subjects.delete(uid);
    await db.tasks.bulkDelete(tids);
    await db.tombstones.bulkPut([uid, ...tids].map((key) => ({ key, at: now })));
  });
  requestSync();
}

export async function readSnapshot() {
  const [subjects, tasks, tombs, cur] = await Promise.all([db.subjects.toArray(), db.tasks.toArray(), db.tombstones.toArray(), db.meta.get('current')]);
  const tombstones = Object.fromEntries(tombs.map((t) => [t.key, t.at]));
  const current = cur ? { year: cur.year, session: cur.session, updatedAt: cur.updatedAt } : null;
  return normalize({ subjects, tasks, tombstones, current });
}

// Make the database match a snapshot exactly (used by restore).
export async function writeSnapshot(snap) {
  const s = normalize(snap);
  await db.transaction('rw', db.subjects, db.tasks, db.tombstones, db.meta, async () => {
    await db.subjects.clear();
    await db.subjects.bulkPut(s.subjects);
    await db.tasks.clear();
    await db.tasks.bulkPut(s.tasks);
    await db.tombstones.clear();
    await db.tombstones.bulkPut(Object.entries(s.tombstones).map(([key, at]) => ({ key, at })));
    if (s.current) await db.meta.put({ key: 'current', ...s.current });
  });
  requestSync();
}

// Clear everything: every subject and task leaves a delete mark, so other devices follow.
export async function clearAll() {
  const now = Date.now();
  await db.transaction('rw', db.subjects, db.tasks, db.tombstones, async () => {
    const uids = [...await db.subjects.toCollection().primaryKeys(), ...await db.tasks.toCollection().primaryKeys()];
    await db.tombstones.bulkPut(uids.map((key) => ({ key, at: now })));
    await db.subjects.clear();
    await db.tasks.clear();
  });
  requestSync();
}

// Import from text: save new and updated subjects in one go. Clears any old delete mark so an imported subject
// isn't removed again by sync. Never deletes. Linked tasks follow the new marks.
export async function importSubjects(list) {
  if (!list.length) return;
  const now = Date.now();
  await db.transaction('rw', db.subjects, db.tombstones, db.tasks, async () => {
    const olds = await db.subjects.bulkGet(list.map((s) => s.uid));
    const rows = list.map((s) => stamp(s, now));
    await db.subjects.bulkPut(rows);
    await db.tombstones.bulkDelete(list.map((s) => s.uid));
    for (let k = 0; k < rows.length; k++) await followMarks(olds[k], rows[k], now);
  });
  requestSync();
}

export async function addSubjects(list) {
  const now = Date.now();
  await db.subjects.bulkPut(list.map((s) => stamp(s, now)));
  requestSync();
}

// ---------- study tasks ----------
export async function putTask(t) {
  const r = stamp(t);
  await db.transaction('rw', db.tasks, db.tombstones, async () => {
    await db.tasks.put(r);
    await db.tombstones.delete(r.uid);
  });
  requestSync();
  return r;
}

export async function addTasks(list) {
  if (!list.length) return;
  const now = Date.now();
  await db.tasks.bulkPut(list.map((t) => stamp(t, now)));
  requestSync();
}

// Save the pop-up's fields. Ticking a repeating task Done here also adds the next one.
export async function saveTask(uid, fields) {
  const now = Date.now();
  const t = await db.tasks.get(uid);
  if (!t) return null;
  let next = setTaskFields(t, fields, now);
  let extra = null;
  if (t.status !== 'done' && next.status === 'done') {
    const r = completeTask({ ...next, status: t.status }, now);
    next = { ...next, doneAt: r.task.doneAt };
    extra = r.next;
  }
  if (!extra && JSON.stringify(next) === JSON.stringify(t)) return t;
  await db.tasks.bulkPut([next, extra].filter(Boolean).map((x) => stamp(x, now)));
  requestSync();
  return next;
}

// Import from text (Study → Import): new and updated tasks in one go.
export async function importTasks(list) {
  if (!list.length) return 0;
  const now = Date.now();
  await db.transaction('rw', db.tasks, db.tombstones, async () => {
    await db.tasks.bulkPut(list.map((t) => stamp(t, now)));
    await db.tombstones.bulkDelete(list.map((t) => t.uid));
  });
  requestSync();
  return list.length;
}

export async function setTaskStatus(uid, status) {
  return saveTask(uid, { status });
}

export async function deleteTask(uid) {
  const now = Date.now();
  await db.transaction('rw', db.tasks, db.tombstones, async () => {
    await db.tasks.delete(uid);
    await db.tombstones.put({ key: uid, at: now });
  });
  requestSync();
}

// Manual order: the given tasks get their new places (others keep theirs).
export async function reorderTasks(uids) {
  const now = Date.now();
  const rows = await db.tasks.bulkGet(uids);
  const base = Math.min(...rows.filter(Boolean).map((t) => t.order ?? 0));
  const puts = rows.map((t, k) => (t && t.order !== base + k ? stamp({ ...t, order: base + k }, now) : null)).filter(Boolean);
  if (!puts.length) return;
  await db.tasks.bulkPut(puts);
  requestSync();
}
