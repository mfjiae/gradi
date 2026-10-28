// Backup and restore, the moni way. A backup is ONE json file holding the same snapshot sync will use
// (subjects, delete marks, current session). It never holds a sync token. Pure parts are tested.
//
// Restore has two ways:
//  - Merge (safe): anything missing here is added (even a subject deleted here earlier: restoring a file means you
//    want what's in it); a subject on both sides keeps its newest edit; nothing is deleted.
//  - Replace: this device becomes the backup. Subjects here that are not in the file are removed (with a delete
//    mark, so other devices follow once sync exists) and every subject from the file is stamped "now" so it beats
//    older delete marks.
import { mergeSnapshots, normalize } from './merge.js';

export const BACKUP_APP = 'gradi';
export const BACKUP_VERSION = 1;

export function buildBackup(snapshot, now = Date.now()) {
  return { app: BACKUP_APP, backupVersion: BACKUP_VERSION, savedAt: now, snapshot: normalize(snapshot) };
}

// YYYY-MM-DD in Sydney time.
export function todaySydney(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export const backupFileName = (d = new Date()) => `gradi-backup-${todaySydney(d)}.json`;

// Reads the text of a picked file. Throws an Error with a plain-words message when it isn't a gradi backup.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn’t a gradi backup (it can’t be read).'); }
  if (!data || data.app !== BACKUP_APP || typeof data.snapshot !== 'object' || !data.snapshot) {
    throw new Error('That file isn’t a gradi backup.');
  }
  if (typeof data.backupVersion !== 'number' || data.backupVersion > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of gradi. Update gradi first.');
  }
  if (data.snapshot.subjects != null && !Array.isArray(data.snapshot.subjects)) throw new Error('This backup file looks damaged.');
  for (const s of data.snapshot.subjects ?? []) {
    if (!s || typeof s.uid !== 'string' || !Array.isArray(s.components ?? [])) throw new Error('This backup file looks damaged.');
  }
  return { savedAt: Number(data.savedAt) || null, snapshot: normalize(data.snapshot) };
}

export function planRestore(local, file, mode, now = Date.now()) {
  const l = normalize(local);
  const f = normalize(file);
  if (mode !== 'replace') {
    const here = new Set(l.subjects.map((r) => r.uid));
    // File delete marks never remove a subject you have here ("nothing is deleted").
    const tombstones = { ...l.tombstones };
    for (const [k, t] of Object.entries(f.tombstones)) if (!here.has(k)) tombstones[k] = Math.max(tombstones[k] ?? 0, t);
    const added = f.subjects.filter((r) => !here.has(r.uid)).map((r) => ({ ...r, updatedAt: now }));
    for (const r of added) delete tombstones[r.uid];
    const both = f.subjects.filter((r) => here.has(r.uid));
    return mergeSnapshots({ ...l, tombstones }, { subjects: [...both, ...added], tombstones: {}, current: f.current });
  }
  const tombstones = { ...l.tombstones, ...f.tombstones };
  const inFile = new Set(f.subjects.map((r) => r.uid));
  for (const r of l.subjects) if (!inFile.has(r.uid)) tombstones[r.uid] = now;
  const subjects = f.subjects.map((r) => ({ ...r, updatedAt: now }));
  for (const r of subjects) delete tombstones[r.uid];
  const current = f.current ? { ...f.current, updatedAt: now } : l.current;
  return normalize({ subjects, tombstones, current });
}
