// Settings: current session, sync between devices (like moni), backup and restore, grade bands, import from text.
import { useRef, useState } from 'react';
import { SESSIONS, BANDS, yearOptions } from '../lib/grades.js';
import { buildBackup, parseBackup, planRestore, backupFileName } from '../lib/backup.js';
import * as store from '../lib/store.js';
import { db } from '../lib/db.js';
import { connect, disconnect, syncNow, DEFAULT_REPO } from '../lib/sync.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { sampleSubjects } from '../lib/sample.js';
import { Pill } from './ui.jsx';
import { useArm } from './hooks.js';
import ImportCard from './ImportCard.jsx';

function SessionCard({ current, years }) {
  const list = yearOptions([...years, current.year]);
  const at = list.indexOf(current.year);
  const setYear = (y) => store.setCurrent({ year: y, session: current.session });
  return (
    <div className="card">
      <h3 className="card-title">Current session</h3>
      <div className="chips">
        {SESSIONS.map((x) => (
          <button type="button" key={x} className={`chip ${current.session === x ? 'on' : ''}`} aria-pressed={current.session === x}
            onClick={() => store.setCurrent({ year: current.year, session: x })}>{x}</button>
        ))}
      </div>
      <div className="stepper">
        <button type="button" className="btn sm" aria-label="Previous year" disabled={at <= 0} onClick={() => setYear(list[at - 1])}>◀</button>
        <select className="in" aria-label="Year" value={current.year} onChange={(e) => setYear(Number(e.target.value))}>
          {list.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="button" className="btn sm" aria-label="Next year" disabled={at >= list.length - 1} onClick={() => setYear(list[at + 1])}>▶</button>
      </div>
      <div className="note">Home shows only subjects in this session. Older sessions stay under Subjects and Past sessions.</div>
    </div>
  );
}

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
function ago(ms) {
  if (!ms) return 'never';
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
  if (sec < 7 * 86400) { const d = Math.floor(sec / 86400); return d === 1 ? 'yesterday' : `${d} days ago`; }
  return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// Sync between devices, the same way moni does it.
function SyncCard() {
  const cfg = useLiveQuery(() => db.meta.get('sync'), []);
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [replace, setReplace] = useState(false);
  const connected = !!cfg?.token;
  const showForm = !connected || replace;

  const onConnect = async (e) => {
    e.preventDefault();
    if (!token.trim()) { setError('Paste your token first.'); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await connect(token, cfg?.repo ?? repo);
      setToken(''); setReplace(false);
      setMsg(r.status === 'ok' ? 'Connected. Your grades are synced.' : r.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const onSyncNow = async () => {
    setBusy(true); setMsg('');
    const r = await syncNow();
    setBusy(false);
    setMsg(r.status === 'ok' ? 'Synced.' : r.message ?? 'Sync is off.');
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ '--head': 'var(--c)' }}>Sync between devices</h3>
      {connected && (
        <>
          <div className="sync-row note">
            <span>Saving to <b>{cfg.repo}</b></span>
            <span>{cfg.syncing ? 'Syncing…' : `Synced ${ago(cfg.lastSyncAt)}`}</span>
          </div>
          {cfg.lastError && <div className="warnbox" role="alert">{cfg.lastError.message}</div>}
          <div className="add-row">
            <button type="button" className="btn sm primary" disabled={busy} onClick={onSyncNow}>{busy ? 'Syncing…' : 'Sync now'}</button>
            {!replace && <button type="button" className="btn sm ghost" onClick={() => setReplace(true)}>Paste a new token</button>}
            {!replace && <button type="button" className="btn sm ghost danger" onClick={async () => { await disconnect(); setMsg('Sync turned off on this device. Your grades stay here.'); }}>Turn off sync</button>}
          </div>
        </>
      )}
      {showForm && (
        <form className="stack" onSubmit={onConnect} noValidate>
          {!connected && <div className="note">Your grades are saved to your private <b>gradi-data</b> repo, so your phone and computer see the same thing. Do this once on each device:</div>}
          <ol className="steps note">
            <li>Open <a href={TOKEN_URL} target="_blank" rel="noreferrer">GitHub → new fine-grained token</a> (sign in if asked).</li>
            <li>Name it <em>gradi</em>. Set an expiration (gradi tells you when it runs out).</li>
            <li>Repository access: <b>Only select repositories</b> → <b>gradi-data</b>.</li>
            <li>Permissions → <b>Add permissions</b> → search <em>contents</em> → pick <b>Contents</b>, set it to <b>Read and write</b>. Nothing else.</li>
            <li>Generate, copy the token, and paste it below.</li>
          </ol>
          {!connected && (
            <label className="field">Data repo
              <input className="in" value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck="false" />
            </label>
          )}
          <label className="field">Token
            <input className="in" type="password" value={token} placeholder="github_pat_…" autoComplete="off" onChange={(e) => { setToken(e.target.value); setError(''); }} />
          </label>
          {error && <div className="warnbox" role="alert">{error}</div>}
          <div className="add-row">
            <button type="submit" className="btn sm primary" disabled={busy}>{busy ? 'Connecting…' : connected ? 'Save new token' : 'Connect and sync'}</button>
            {replace && <button type="button" className="btn sm ghost" onClick={() => setReplace(false)}>Cancel</button>}
          </div>
          <div className="note">The token is stored only on this device. It can only touch gradi-data, nothing else on your GitHub.</div>
        </form>
      )}
      {msg && <div className="okbox" role="status">{msg}</div>}
    </div>
  );
}

function DataCard({ count, taskCount = 0 }) {
  const syncOn = !!useLiveQuery(() => db.meta.get('sync'), [])?.token;
  const lastBackup = useLiveQuery(() => db.meta.get('lastBackup'), [])?.at;
  const arm = useArm();
  const file = useRef(null);
  const [msg, setMsg] = useState(null);
  const [pending, setPending] = useState(null); // a parsed backup waiting for Merge / Replace

  const download = async () => {
    const snap = await store.readSnapshot();
    const blob = new Blob([JSON.stringify(buildBackup(snap), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    await db.meta.put({ key: 'lastBackup', at: Date.now() }); // this device only: never synced or backed up
    setMsg({ ok: true, text: `Saved ${a.download} (${snap.subjects.length} subject${snap.subjects.length === 1 ? '' : 's'}).` });
  };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setPending(parseBackup(await f.text()));
      setMsg(null);
    } catch (err) {
      setPending(null);
      setMsg({ ok: false, text: err.message });
    }
  };
  const restore = async (mode) => {
    const local = await store.readSnapshot();
    await store.writeSnapshot(planRestore(local, pending.snapshot, mode));
    const n = pending.snapshot.subjects.length;
    setPending(null);
    setMsg({ ok: true, text: mode === 'replace' ? `Replaced with the backup (${n} subjects).` : `Merged the backup (${n} subjects in the file).` });
  };
  return (
    <div className="card">
      <h3 className="card-title">Backup</h3>
      <div className="note">A backup is one file of all your grades and study tasks. Keep one now and then, even with sync on.</div>
      <div className="info-box">
        <div><span>On this device</span><b>{count} subject{count === 1 ? '' : 's'}{taskCount ? ` · ${taskCount} task${taskCount === 1 ? '' : 's'}` : ''}</b></div>
        <div><span>Last backup</span><b>{lastBackup ? ago(lastBackup) : 'never'}</b></div>
      </div>
      <div className="add-row">
        <button type="button" className="btn sm" onClick={download}>Download backup</button>
        <button type="button" className="btn sm" onClick={() => file.current?.click()}>Restore from file</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={pick} />
        {count === 0 && !syncOn && <button type="button" className="btn sm" onClick={async () => { const cur = await store.getCurrent(); await store.addSubjects(sampleSubjects(cur)); setMsg({ ok: true, text: 'Added 8 fake sample subjects. Clear everything removes them.' }); }}>Load sample subjects</button>}
        {count > 0 && (
          <button type="button" className="btn sm danger" onClick={() => arm.tap('clear', async () => { await store.clearAll(); setMsg({ ok: true, text: 'Cleared every subject and task on this device.' }); })}>
            {arm.armed === 'clear' ? (syncOn ? 'Tap again: clears every synced device' : 'Tap again to clear') : 'Clear everything'}
          </button>
        )}
      </div>
      {pending && (
        <div className="stack">
          <div className="note">Backup {pending.savedAt ? `from ${new Date(pending.savedAt).toLocaleString('en-AU')}` : ''} with {pending.snapshot.subjects.length} subject{pending.snapshot.subjects.length === 1 ? '' : 's'}. How should it be loaded?</div>
          <div className="add-row">
            <button type="button" className="btn sm primary" onClick={() => restore('merge')}>Merge (safe)</button>
            <button type="button" className="btn sm danger" onClick={() => arm.tap('replace', () => restore('replace'))}>{arm.armed === 'replace' ? 'Tap again to replace' : 'Replace this device'}</button>
            <button type="button" className="btn sm ghost" onClick={() => setPending(null)}>Cancel</button>
          </div>
          <div className="note">Merge adds what's missing and keeps the newest edit of each subject; nothing is deleted. Replace makes this device match the file exactly.</div>
        </div>
      )}
      {msg && <div className={msg.ok ? 'okbox' : 'warnbox'} role="status">{msg.text}</div>}
    </div>
  );
}

const RANGE = { HD: '85–100', D: '75–84', C: '65–74', P: '50–64', F: '0–49' };
function BandsCard() {
  return (
    <div className="card">
      <h3 className="card-title">Grade bands</h3>
      <div className="tbl">
        <div className="tr th bands"><span>Grade</span><span>Marks</span><span>Grade points</span></div>
        {BANDS.map((b) => (
          <div className="tr bands" key={b.k}><span><Pill band={b} /></span><span>{RANGE[b.k]}</span><b>{b.gp}</b></div>
        ))}
      </div>
      <div className="note">Bands use the whole-number mark. GPA weights each subject by credit points. Pass, not graded is left out of GPA and WAM.</div>
    </div>
  );
}

export default function Settings({ current, count, taskCount, years }) {
  // Desktop: two columns so each card is only as tall as its content (left: session + backup, right: sync +
  // bands), Import full width below. Phone: one column in the order session, sync, backup, bands, import.
  return (
    <>
      <div className="head"><h1 className="h1">Settings</h1></div>
      <div className="set-cols">
        <div className="set-col">
          <div className="o1"><SessionCard current={current} years={years} /></div>
          <div className="o3"><DataCard count={count} taskCount={taskCount} /></div>
        </div>
        <div className="set-col">
          <div className="o2"><SyncCard /></div>
          <div className="o4"><BandsCard /></div>
        </div>
      </div>
      <ImportCard />
    </>
  );
}
