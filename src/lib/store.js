// Database actions. Every write stamps updatedAt and calls requestSync() (a no-op until sync is built in M3).
import { db } from './db.js';
import { normalize } from './merge.js';
import { guessSession } from './grades.js';

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

export async function putSubject(s) {
  const r = stamp(s);
  await db.transaction('rw', db.subjects, db.tombstones, async () => {
    await db.subjects.put(r);
    await db.tombstones.delete(r.uid); // an edit after a delete brings it back
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

export async function deleteSubject(uid) {
  const now = Date.now();
  await db.transaction('rw', db.subjects, db.tombstones, async () => {
    await db.subjects.delete(uid);
    await db.tombstones.put({ key: uid, at: now });
  });
  requestSync();
}

export async function readSnapshot() {
  const [subjects, tombs, cur] = await Promise.all([db.subjects.toArray(), db.tombstones.toArray(), db.meta.get('current')]);
  const tombstones = Object.fromEntries(tombs.map((t) => [t.key, t.at]));
  const current = cur ? { year: cur.year, session: cur.session, updatedAt: cur.updatedAt } : null;
  return normalize({ subjects, tombstones, current });
}

// Make the database match a snapshot exactly (used by restore, and later by sync).
export async function writeSnapshot(snap) {
  const s = normalize(snap);
  await db.transaction('rw', db.subjects, db.tombstones, db.meta, async () => {
    await db.subjects.clear();
    await db.subjects.bulkPut(s.subjects);
    await db.tombstones.clear();
    await db.tombstones.bulkPut(Object.entries(s.tombstones).map(([key, at]) => ({ key, at })));
    if (s.current) await db.meta.put({ key: 'current', ...s.current });
  });
  requestSync();
}

// Clear everything: every subject leaves a delete mark, so other devices follow once sync exists.
export async function clearAll() {
  const now = Date.now();
  await db.transaction('rw', db.subjects, db.tombstones, async () => {
    const uids = await db.subjects.toCollection().primaryKeys();
    await db.tombstones.bulkPut(uids.map((key) => ({ key, at: now })));
    await db.subjects.clear();
  });
  requestSync();
}

export async function addSubjects(list) {
  const now = Date.now();
  await db.subjects.bulkPut(list.map((s) => stamp(s, now)));
  requestSync();
}
