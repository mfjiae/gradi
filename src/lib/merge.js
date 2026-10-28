// Pure merge logic, shared by backup restore (M1) and sync between devices (M3). Tested.
//
// A snapshot = { version, subjects, tombstones, current }.
//  - subjects: subject records. Each has a stable `uid` and `updatedAt` (ms). A subject syncs as ONE record
//    (its components and parts travel with it), so if the same subject is edited on two devices before they
//    sync, the newer edit wins for the whole subject.
//  - tombstones: { uid: deletedAt }. A delete mark removes a record unless it was edited after the delete.
//  - current: the current session { year, session, updatedAt }; the newest one wins.

export const SNAPSHOT_VERSION = 1;

const byUid = (a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0);

export function normalize(s) {
  return {
    version: SNAPSHOT_VERSION,
    subjects: [...(s?.subjects ?? [])].filter((r) => r && r.uid).sort(byUid),
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

export function mergeSnapshots(a, b) {
  const A = normalize(a);
  const B = normalize(b);
  const tombstones = { ...A.tombstones };
  for (const [k, t] of Object.entries(B.tombstones)) tombstones[k] = Math.max(tombstones[k] ?? 0, t);
  const out = new Map();
  for (const r of [...A.subjects, ...B.subjects]) out.set(r.uid, newer(out.get(r.uid), r));
  const subjects = [...out.values()].filter((r) => !(tombstones[r.uid] != null && tombstones[r.uid] >= (r.updatedAt ?? 0)));
  return normalize({ subjects, tombstones, current: newer(A.current, B.current) });
}
