// Sync this device with gradi.json in the private gradi-data repo (works the same way as moni's sync).
// Flow: read remote -> merge with local -> save merged locally -> write remote if it changed.
// Runs a moment after each edit (store.js calls requestSync), when the app opens or comes back to the screen,
// when the connection returns, and from Settings → Sync now. The token is stored on this device only
// (meta row 'sync'); it is never in backups or the synced file.
import { db } from './db.js';
import { mergeSnapshots, sameSnapshot, stableStringify, isDeleted } from './merge.js';
import { checkRepo, readFile, writeFile, SyncError } from './github.js';
import { readSnapshot, setSyncHook } from './store.js';

export const DATA_PATH = 'gradi.json';
export const DEFAULT_REPO = 'mfjiae/gradi-data';

// Apply the merged snapshot without losing edits made while the sync was running:
// a subject or task is only overwritten by a version at least as new, and only deleted by a newer delete.
async function applyTable(table, incoming, tombstones) {
  const current = new Map((await table.toArray()).map((r) => [r.uid, r]));
  const puts = incoming.filter((r) => {
    const cur = current.get(r.uid);
    return !cur || ((cur.updatedAt ?? 0) <= (r.updatedAt ?? 0) && stableStringify(cur) !== stableStringify(r));
  });
  if (puts.length) await table.bulkPut(puts);
  const dels = [...current.values()].filter((r) => isDeleted(r, tombstones)).map((r) => r.uid);
  if (dels.length) await table.bulkDelete(dels);
}

export async function writeLocal(merged) {
  await db.transaction('rw', db.subjects, db.tasks, db.tombstones, db.meta, async () => {
    await applyTable(db.subjects, merged.subjects, merged.tombstones);
    await applyTable(db.tasks, merged.tasks ?? [], merged.tombstones);
    await db.tombstones.bulkPut(Object.entries(merged.tombstones).map(([key, at]) => ({ key, at })));
    if (merged.current) {
      const cur = await db.meta.get('current');
      if (!cur || (cur.updatedAt ?? 0) < (merged.current.updatedAt ?? 0)) await db.meta.put({ ...merged.current, key: 'current' });
    }
  });
}

const deviceName = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px)').matches ? 'desktop' : 'phone');

async function setStatus(changes) {
  const cfg = await db.meta.get('sync');
  if (cfg) await db.meta.put({ ...cfg, ...changes });
}

async function runSync() {
  const cfg = await db.meta.get('sync');
  if (!cfg?.token) return { status: 'off' };
  await setStatus({ syncing: true });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await readFile(cfg.token, cfg.repo, DATA_PATH);
      const local = await readSnapshot();
      const merged = mergeSnapshots(local, remote?.data);
      if (!sameSnapshot(merged, local)) await writeLocal(merged);
      if (!remote || !sameSnapshot(merged, remote.data)) {
        try {
          await writeFile(cfg.token, cfg.repo, DATA_PATH, merged, remote?.sha, `gradi sync from ${deviceName()}`);
        } catch (e) {
          if (e.kind === 'conflict' && attempt < 2) continue; // another device saved first: merge again
          throw e;
        }
      }
      await setStatus({ syncing: false, lastSyncAt: Date.now(), lastError: null });
      return { status: 'ok' };
    }
    throw new SyncError('conflict', 'Kept clashing with another device. Will try again shortly.');
  } catch (e) {
    const kind = e.kind ?? 'other';
    // Being offline isn't an error worth showing; everything else is.
    await setStatus({ syncing: false, lastError: kind === 'offline' ? null : { kind, message: e.message, at: Date.now() } });
    return { status: 'error', kind, message: e.message };
  }
}

let running = null;
let again = false;
export function syncNow() {
  if (running) { again = true; return running; }
  running = runSync().finally(() => {
    running = null;
    if (again) { again = false; syncNow(); }
  });
  return running;
}

let timer = null;
export function requestSync(delayMs = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, delayMs);
}
// Every saved edit (store.js) asks for a sync a moment later.
setSyncHook(() => requestSync());

export const cleanRepo = (repo) => repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');

// Connect: verify the token can see a PRIVATE repo, save it on this device, then sync.
export async function connect(token, repo) {
  const t = token.trim();
  const r = cleanRepo(repo);
  await checkRepo(t, r);
  const prev = await db.meta.get('sync');
  await db.meta.put({ key: 'sync', token: t, repo: r, connectedAt: prev?.connectedAt ?? Date.now(), lastSyncAt: prev?.lastSyncAt ?? null, lastError: null });
  return syncNow();
}

export const disconnect = () => db.meta.delete('sync');
