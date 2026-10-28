// Home (Layout A v6): all-sessions GPA, WAM and target GPA with this session beneath; this session's subjects;
// Past sessions under them; Due soon (with exam countdowns) and "Where the marks are" on the right.
// Phones: Due soon comes right after the stats.
import { calc, bandOf, result, overall, fmt, isCurrent, groupSessions, sessionName, pendingAcross, num } from '../lib/grades.js';
import { needShort, needColor } from '../lib/display.js';
import { Pill, Row } from './ui.jsx';
import { useLocalPref, useNow } from './hooks.js';
import { DueSoonCard } from './tasksUi.jsx';


// A big number card. With no number yet the dash is quiet grey (it looked like a colored bar) and, on an empty
// Home, a short reason replaces the "this session" line.
function Stat({ label, color, tint, value, reason, children }) {
  const none = value === '—';
  return (
    <div className={`card ${tint} ${none ? 'stat-empty' : ''}`}>
      <div className="eyebrow" style={{ color: `var(${color})` }}>{label}</div>
      <div className="big" style={{ color: `var(${color})` }}>{none ? '–' : value}</div>
      <div className="note">{reason ?? children}</div>
    </div>
  );
}

function PastSessions({ subjects, current, open }) {
  const [on, setOn] = useLocalPref('showPast', false);
  const past = groupSessions(subjects.filter((s) => !isCurrent(s, current)));
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title" style={{ '--head': 'var(--p)' }}>Past sessions</h3>
        <button type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setOn(!on)}>{on ? 'Showing' : 'Show'}</button>
      </div>
      {!on && <div className="note">Hidden. Turn on to see earlier sessions, their GPA and WAM.</div>}
      {on && (past.length ? (
        <div className="tbl">
          <div className="tr th"><span>Subject</span><span>Grade</span><span>Mark</span><span>Cp</span></div>
          {past.map((x) => {
            const o = overall(x.subs);
            const cp = x.subs.reduce((a, s) => a + (num(s.cp) || 0), 0);
            return [
              <div className="tr sess" key={x.key}>
                <span className="nm">{sessionName(x)}<small>GPA {fmt(o.gpa, 2)} · WAM {fmt(o.avg)}</small></span>
                <span /><span /><span>{fmt(cp, 0)}</span>
              </div>,
              ...x.subs.map((s) => (
                <Row key={s.uid} onOpen={() => open(s.uid)}>
                  <span className="nm">{s.code}</span><span><Pill band={bandOf(s)} /></span>
                  <span>{result(s).mark ?? '—'}</span><span>{fmt(s.cp, 0)}</span>
                </Row>
              )),
            ];
          })}
        </div>
      ) : <div className="note">No past sessions yet.</div>)}
    </div>
  );
}

export default function Home({ subjects, tasks = [], current, open, go, onOpenTask }) {
  const now = useNow();
  const subs = subjects.filter((s) => isCurrent(s, current));
  const cur = overall(subs);
  const done = overall(subjects, { onlyOfficial: true });
  const all = overall(subjects);
  const pend = pendingAcross(subs.filter((s) => !s.official));
  const empty = subjects.length === 0;
  return (
    <>
      {empty ? (
        <div className="stack home-empty">
          <h1 className="h1">{sessionName(current)}</h1>
          <div className="note">No subjects yet</div>
        </div>
      ) : (
        <div className="head">
          <h1 className="h1">{sessionName(current)}</h1>
          <span className="pillbtn">{fmt(done.gained, 0)} credit points gained · {subs.length} subject{subs.length === 1 ? '' : 's'} now</span>
        </div>
      )}
      <div className="grid g3">
        <Stat label="GPA · all sessions" color="--hd" tint="tint-g" value={fmt(done.gpa, 2)} reason={empty ? 'Needs a result' : null}>this session on track <b>{fmt(cur.gpa, 2)}</b></Stat>
        <Stat label="WAM · all sessions" color="--c" tint="tint-b" value={fmt(done.avg)} reason={empty ? 'Needs a mark' : null}>this session <b>{cur.avg == null ? '—' : `${fmt(cur.avg)}%`}</b></Stat>
        <Stat label="GPA if every target is hit" color="--warn" tint="tint-o" value={fmt(all.gpaTarget, 2)} reason={empty ? 'Needs a subject' : null}>this session <b>{fmt(cur.gpaTarget, 2)}</b></Stat>
      </div>
      <div className="cols home-cols">
        <div className="stack">
          <div className="card o2">
            <div className="card-head">
              <h3 className="card-title">Subjects</h3>
              <button type="button" className="link" onClick={() => go('subjects')}>See all</button>
            </div>
            {subs.length ? (
              <div className="tbl">
                <div className="tr th"><span>Subject</span><span>Grade</span><span>Avg</span><span>Need</span></div>
                {subs.map((s) => {
                  const r = calc(s);
                  return (
                    <Row key={s.uid} onOpen={() => open(s.uid)}>
                      <span className="nm">{s.code}</span><span><Pill band={bandOf(s, r)} /></span>
                      <span>{r.avg == null ? '—' : `${fmt(r.avg)}%`}</span>
                      <b style={{ color: needColor(r) }}>{s.official ? '—' : needShort(r)}</b>
                    </Row>
                  );
                })}
              </div>
            ) : <div className="empty">No subjects in this session. Tap Add subject.</div>}
          </div>
          <div className="o4"><PastSessions subjects={subjects} current={current} open={open} /></div>
        </div>
        <div className="stack">
        {!empty && <div className="o1"><DueSoonCard tasks={tasks} subjects={subjects} now={now} onOpen={onOpenTask} go={go} /></div>}
        <div className="card o3">
          <h3 className="card-title" style={{ '--head': 'var(--warn)' }}>Where the marks are</h3>
          {pend.length ? (
            <div className="tbl">
              <div className="tr th two"><span>Assessment still to come</span><span>Points</span></div>
              {pend.map((p) => (
                <Row key={`${p.sid}${p.iid}`} className="two" onOpen={() => open(p.sid)}>
                  <span className="nm">{p.code}<small>{p.label}</small></span><b>{fmt(p.pts)}</b>
                </Row>
              ))}
            </div>
          ) : <div className="note">Nothing pending.</div>}
        </div>
        </div>
      </div>
    </>
  );
}
