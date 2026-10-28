// Subjects: cards for this session, or every session grouped (newest first).
import { calc, bandOf, result, overall, fmt, isCurrent, groupSessions, sessionName } from '../lib/grades.js';
import { Pill, Ladder } from './ui.jsx';
import { useLocalPref } from './hooks.js';
import { needShort, needColor } from '../lib/display.js';

function SubjectCard({ s, open }) {
  const r = calc(s);
  const res = result(s);
  return (
    <div className="card scard" role="button" tabIndex={0} onClick={() => open(s.uid)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(s.uid); } }}>
      <div>
        <div className="scard-top"><div className="mid">{s.code}</div><Pill band={bandOf(s, r)} /></div>
        <div className="note">{s.name || 'Subject'} · {sessionName(s)} · {fmt(s.cp, 0)} cp</div>
      </div>
      {res.official ? (
        <div className="stat-row">
          <div className="stat"><b>{res.mark ?? '—'}</b><span>official mark</span></div>
          <div className="stat"><b>{res.gp ?? '—'}</b><span>grade points</span></div>
          <div className="stat"><b>{fmt(s.cp, 0)}</b><span>credit points</span></div>
        </div>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat"><b>{r.avg == null ? '—' : `${fmt(r.avg)}%`}</b><span>average so far</span></div>
            <div className="stat"><b>{fmt(r.banked)}</b><span>banked of 100</span></div>
            <div className="stat"><b style={{ color: needColor(r) }}>{needShort(r)}</b><span>needed for {fmt(r.T, 0)}</span></div>
          </div>
          <Ladder r={r} />
        </>
      )}
    </div>
  );
}

export default function Subjects({ subjects, current, open }) {
  const [scope, setScope] = useLocalPref('scope', 'cur');
  const all = scope === 'all';
  const cur = subjects.filter((s) => isCurrent(s, current));
  return (
    <>
      <div className="head">
        <h1 className="h1">Subjects</h1>
        <div className="chips">
          <button type="button" className={`chip ${!all ? 'on' : ''}`} aria-pressed={!all} onClick={() => setScope('cur')}>This session</button>
          <button type="button" className={`chip ${all ? 'on' : ''}`} aria-pressed={all} onClick={() => setScope('all')}>All sessions</button>
        </div>
      </div>
      {all ? (
        subjects.length ? groupSessions(subjects).map((x) => (
          <section key={x.key} className="stack">
            <div className="head">
              <h3 className="card-title" style={{ '--head': 'var(--p)' }}>{sessionName(x)}</h3>
              <span className="note">GPA {fmt(overall(x.subs).gpa, 2)}</span>
            </div>
            <div className="grid gauto">{x.subs.map((s) => <SubjectCard key={s.uid} s={s} open={open} />)}</div>
          </section>
        )) : <div className="empty">No subjects yet. Tap Add subject.</div>
      ) : (
        <div className="grid gauto">
          {cur.length ? cur.map((s) => <SubjectCard key={s.uid} s={s} open={open} />) : <div className="empty">No subjects in this session.</div>}
        </div>
      )}
    </>
  );
}
