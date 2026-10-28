// Sync with a fake GitHub (no network). Fake subjects only.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db.js';
import * as store from '../store.js';
import { newSubject } from '../edit.js';
import { connect, disconnect, syncNow, DATA_PATH, cleanRepo } from '../sync.js';
import { toBase64, fromBase64 } from '../github.js';

// A tiny in-memory stand-in for the GitHub contents API.
function fakeGitHub({ isPrivate = true, token = 'good' } = {}) {
  const gh = { file: null, sha: 0, puts: 0, failNextPut: 0 };
  gh.fetch = vi.fn(async (url, init = {}) => {
    const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
    if (init.headers?.Authorization !== `Bearer ${token}`) return json(401, {});
    const path = url.replace('https://api.github.com', '');
    if (path === '/repos/mfjiae/gradi-data') return json(200, { private: isPrivate });
    if (path !== `/repos/mfjiae/gradi-data/contents/${DATA_PATH}`) return json(404, {});
    if (!init.method) return gh.file ? json(200, { content: toBase64(gh.file), sha: String(gh.sha) }) : json(404, {});
    const body = JSON.parse(init.body);
    if (gh.failNextPut > 0) { gh.failNextPut -= 1; gh.sha += 1; return json(409, {}); }
    if (gh.file && body.sha !== String(gh.sha)) return json(409, {});
    gh.file = fromBase64(body.content); gh.sha += 1; gh.puts += 1;
    return json(200, { content: { sha: String(gh.sha) } });
  });
  gh.data = () => JSON.parse(gh.file);
  return gh;
}

let gh;
beforeEach(async () => {
  await db.delete(); await db.open();
  gh = fakeGitHub();
  vi.stubGlobal('fetch', gh.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('sync', () => {
  it('is off until connected', async () => {
    expect((await syncNow()).status).toBe('off');
    expect(gh.fetch).not.toHaveBeenCalled();
  });

  it('refuses a public data repo and a bad token, in plain words', async () => {
    vi.stubGlobal('fetch', fakeGitHub({ isPrivate: false }).fetch);
    await expect(connect('good', 'mfjiae/gradi-data')).rejects.toThrow(/is public/);
    await expect(connect('bad', 'mfjiae/gradi-data')).rejects.toThrow(/rejected the token/);
    expect(await db.meta.get('sync')).toBeUndefined();
  });

  it('first connect uploads this device and keeps the token out of the file', async () => {
    await store.putSubject(newSubject({ code: 'FAKE_A', year: 2026, session: 'Spring' }));
    const r = await connect('good', 'https://github.com/mfjiae/gradi-data.git');
    expect(r.status).toBe('ok');
    expect(gh.data().subjects.map((s) => s.code)).toEqual(['FAKE_A']);
    expect(gh.file).not.toContain('good');
    expect((await db.meta.get('sync')).lastSyncAt).toBeGreaterThan(0);
  });

  it('pulls subjects and deletes made on another device', async () => {
    const a = await store.putSubject(newSubject({ code: 'FAKE_A' }));
    await connect('good', 'mfjiae/gradi-data');
    // "another device" adds B and deletes A
    const other = gh.data();
    const b = { ...newSubject({ code: 'FAKE_B' }), updatedAt: Date.now() + 10 };
    gh.file = JSON.stringify({ ...other, subjects: [b], tombstones: { [a.uid]: Date.now() + 10 } });
    gh.sha += 1;
    await syncNow();
    expect((await db.subjects.toArray()).map((s) => s.code)).toEqual(['FAKE_B']);
    expect((await store.readSnapshot()).tombstones[a.uid]).toBeGreaterThan(0);
  });

  it('newest edit wins and a newer local edit is not overwritten', async () => {
    const a = await store.putSubject(newSubject({ code: 'OLD' }));
    await connect('good', 'mfjiae/gradi-data');
    const remote = gh.data();
    remote.subjects[0] = { ...remote.subjects[0], code: 'STALE', updatedAt: a.updatedAt - 1000 };
    gh.file = JSON.stringify(remote); gh.sha += 1;
    await syncNow();
    expect((await db.subjects.get(a.uid)).code).toBe('OLD');
    expect(gh.data().subjects[0].code).toBe('OLD');
  });

  it('merges again when another device saved first (conflict)', async () => {
    await store.putSubject(newSubject({ code: 'FAKE_A' }));
    gh.failNextPut = 1;
    const r = await connect('good', 'mfjiae/gradi-data');
    expect(r.status).toBe('ok');
    expect(gh.puts).toBe(1);
  });

  it('does not write when nothing changed', async () => {
    await store.putSubject(newSubject({ code: 'FAKE_A' }));
    await connect('good', 'mfjiae/gradi-data');
    const before = gh.puts;
    await syncNow();
    expect(gh.puts).toBe(before);
  });

  it('syncs the current session (newest wins)', async () => {
    await store.setCurrent({ year: 2026, session: 'Autumn' });
    await connect('good', 'mfjiae/gradi-data');
    const remote = gh.data();
    gh.file = JSON.stringify({ ...remote, current: { year: 2026, session: 'Spring', updatedAt: Date.now() + 50 } }); gh.sha += 1;
    await syncNow();
    expect((await store.getCurrent()).session).toBe('Spring');
  });

  it('shows errors but stays quiet when offline', async () => {
    await connect('good', 'mfjiae/gradi-data');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect((await syncNow()).kind).toBe('offline');
    expect((await db.meta.get('sync')).lastError).toBeNull();
    vi.stubGlobal('fetch', fakeGitHub({ token: 'other' }).fetch);
    expect((await syncNow()).kind).toBe('auth');
    expect((await db.meta.get('sync')).lastError.message).toMatch(/rejected the token/);
  });

  it('turning sync off forgets the token but keeps the grades', async () => {
    await store.putSubject(newSubject({ code: 'FAKE_A' }));
    await connect('good', 'mfjiae/gradi-data');
    await disconnect();
    expect(await db.meta.get('sync')).toBeUndefined();
    expect(await db.subjects.count()).toBe(1);
  });

  it('backups never include the token', async () => {
    await connect('good', 'mfjiae/gradi-data');
    expect(JSON.stringify(await store.readSnapshot())).not.toContain('good');
  });

  it('cleans pasted repo links', () => {
    expect(cleanRepo(' https://github.com/mfjiae/gradi-data/ ')).toBe('mfjiae/gradi-data');
  });
});
