// Settings: current session, sync (placeholder until M3), backup and restore, grade bands.
import { useRef, useState } from 'react';
import { SESSIONS, BANDS, yearOptions } from '../lib/grades.js';
import { buildBackup, parseBackup, planRestore, backupFileName } from '../lib/backup.js';
import * as store from '../lib/store.js';
import { sampleSubjects } from '../lib/sample.js';
import { Pill } from './ui.jsx';
import { useArm } from './hooks.js';

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

function SyncCard() {
  return (
    <div className="card">
      <h3 className="card-title" style={{ '--head': 'var(--c)' }}>Sync</h3>
      <div className="note">Not built yet. Planned the way moni does it: a private GitHub repo (gradi-data) holds your grades, each device keeps its own copy, newest edit wins. For now your grades stay on this device; use Backup to move them.</div>
      <div><button type="button" className="btn sm" disabled>Connect GitHub (later)</button></div>
    </div>
  );
}

function DataCard({ count }) {
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
      <div className="note">Your grades are stored on this device only. A backup is one file you can keep or load on another device.</div>
      <div className="add-row">
        <button type="button" className="btn sm" onClick={download}>Download backup</button>
        <button type="button" className="btn sm" onClick={() => file.current?.click()}>Restore from file</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={pick} />
        {count === 0 && <button type="button" className="btn sm" onClick={async () => { const cur = await store.getCurrent(); await store.addSubjects(sampleSubjects(cur)); setMsg({ ok: true, text: 'Added 8 fake sample subjects. Clear everything removes them.' }); }}>Load sample subjects</button>}
        {count > 0 && (
          <button type="button" className="btn sm danger" onClick={() => arm.tap('clear', async () => { await store.clearAll(); setMsg({ ok: true, text: 'Cleared every subject on this device.' }); })}>
            {arm.armed === 'clear' ? 'Tap again to clear' : 'Clear everything'}
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

export default function Settings({ current, count, years }) {
  return (
    <>
      <div className="head"><h1 className="h1">Settings</h1></div>
      <div className="grid g2">
        <SessionCard current={current} years={years} />
        <SyncCard />
        <DataCard count={count} />
        <BandsCard />
      </div>
    </>
  );
}
