// Local database (IndexedDB via Dexie): this device's copy of the grades.
// Once sync exists (M3) it is merged with gradi.json in the private gradi-data repo.
//
// Rule (learned in moni): a table's key can never change in place (the upgrade fails and the app stays on
// "Loading…"). To change a key: drop the table in one version (`name: null`), re-create it in the next.
import Dexie from 'dexie';

export const db = new Dexie('gradi');

// v1 (M1): subjects (one record per subject, components inside), delete marks, and meta.
// meta rows: 'current' = the current session { year, session, updatedAt } (synced);
// 'persistAsked' (this device only).
db.version(1).stores({
  subjects: 'uid, year, session',
  tombstones: 'key',
  meta: 'key',
});

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
