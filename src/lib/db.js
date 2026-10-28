// Local database (IndexedDB via Dexie): this device's copy of the grades and study tasks.
// Sync merges it with gradi.json in the private gradi-data repo.
//
// Rule (learned in moni): a table's key can never change in place (the upgrade fails and the app stays on
// "Loading…"). To change a key: drop the table in one version (`name: null`), re-create it in the next.
// Adding a new table is safe. Every schema change is tested as an UPGRADE with seeded data (data.test.js).
import Dexie from 'dexie';

// All versions, oldest first. Kept as a function so the upgrade test can open an older database with it.
export function applySchema(d) {
  // v1 (M1): subjects (one record per subject, components inside), delete marks, and meta.
  // meta rows: 'current' = the current session { year, session, updatedAt } (synced);
  // 'persistAsked', 'sync', 'lastBackup' (this device only).
  d.version(1).stores({
    subjects: 'uid, year, session',
    tombstones: 'key',
    meta: 'key',
  });
  // v2 (M5): study tasks, one record per task. Delete marks share the tombstones table (uids never clash).
  d.version(2).stores({
    tasks: 'uid, subjectUid',
  });
  return d;
}

export const db = applySchema(new Dexie('gradi'));

// Ask the browser not to clear our data under storage pressure. Some browsers prompt, so ask once per device.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return true;
    if (await db.meta.get('persistAsked')) return false;
    await db.meta.put({ key: 'persistAsked', at: Date.now() });
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
