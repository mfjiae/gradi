// Pure merge logic, shared by backup restore and sync between devices. Tested.
//
// A snapshot = { version, subjects, tasks, tombstones, current }.
//  - subjects: subject records. Each has a stable `uid` and `updatedAt` (ms). A subject syncs as ONE record
//    (its components and parts travel with it), so if the same subject is edited on two devices before they
//    sync, the newer edit wins for the whole subject.
//  - tasks (M5): study task records, same rules (newest edit wins per task). Older snapshots have none.
//  - tombstones: { uid: deletedAt } for subjects and tasks. A delete mark removes a record unless it was edited
//    after the delete.
//  - current: the current session { year, session, updatedAt }; the newest one wins.
//
// Older app versions ignore `tasks` but keep every delete mark, so a not-yet-updated device can't delete tasks.

export const SNAPSHOT_VERSION = 1;

const byUid = (a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);
const clean = (list) => [...(Array.isArray(list) ? list : [])].filter((r) => r && r.uid).sort(byUid);

export function normalize(s) {
  return {
    version: SNAPSHOT_VERSION,
    subjects: clean(s?.subjects),
    tasks: clean(s?.tasks),
    tombstones: { ...(s?.tombstones ?? {}) },
    current: s?.current ?? null,
  };
}

export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}
export const sameSnapshot = (a, b) => stableStringify(normalize(a)) === stableStringify(normalize(b));

const newer = (a, b) => (!a ? b : !b ? a : (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a);
export const isDeleted = (r, tombstones) => tombstones[r.uid] != null && tombstones[r.uid] >= (r.updatedAt ?? 0);

function mergeList(a, b, tombstones) {
  const out = new Map();
  for (const r of [...a, ...b]) out.set(r.uid, newer(out.get(r.uid), r));
  return [...out.values()].filter((r) => !isDeleted(r, tombstones));
}

export function mergeSnapshots(a, b) {
  const A = normalize(a);
  const B = normalize(b);
  const tombstones = { ...A.tombstones };
  for (const [k, t] of Object.entries(B.tombstones)) tombstones[k] = Math.max(tombstones[k] ?? 0, t);
  return normalize({
    subjects: mergeList(A.subjects, B.subjects, tombstones),
    tasks: mergeList(A.tasks, B.tasks, tombstones),
    tombstones,
    current: newer(A.current, B.current),
  });
}
