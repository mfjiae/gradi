// Subjects → Plan (M7 degree planner, layout B Roadmap with fold style A, locked 15 Nov 2026).
// Desktop: the roadmap list on the left; Degree progress, Finish, GPA at graduation and Load per session on the
// right. Phones: those cards first, then the list.
// List order: this year (always open, no buttons), then each later year (its own fold button), then Past sessions
// (one fold button, folded by default). Each device remembers what is folded and where the slider sits.
import { useState } from 'react';
import { fmt, sessionName, sessionShort, sessionKey, bandOf, result } from '../lib/grades.js';
import {
  planStatus, planGroups, degreeProgress, finishSession, gradGpa, upcomingLoads, loadState, canShift, shiftSession,
  countsDegree, defaultAvg, nextSession, DEFAULT_DEGREE_TOTAL,
} from '../lib/plan.js';
import * as E from '../lib/edit.js';
import * as store from '../lib/store.js';
import { useLocalPref } from './hooks.js';

const STATUS_PILL = { now: ['In progress', '--review'], waiting: ['No result yet', '--warn'], enrolled: ['Enrolled', '--accent'] };

function StatusPill({ s, current }) {
  const st = planStatus(s, current);
  if (st === 'done') {
    const b = bandOf(s);
    const mark = result(s).mark;
    return <span className="pill" style={{ '--bc': `var(${b?.c ?? '--other'})` }}>{b?.k ?? '—'}{mark != null ? ` ${mark}` : ''}</span>;
  }
  if (st === 'planned') return <span className="pill plan-dash">Planned</span>;
  const [label, c] = STATUS_PILL[st];
  return <span className="pill" style={{ '--bc': `var(${c})` }}>{label}</span>;
}

function SubjectRow({ s, current, open }) {
  const st = planStatus(s, current);
  const counts = countsDegree(s);
  const move = (dir) => store.updateSubject(s.uid, (x) => E.setSession(x, shiftSession(x, dir)));
  let act = null;
  if (st === 'done') {
    act = (
      <button type="button" className="sw" role="switch" aria-checked={counts} title="Counts toward the degree"
        aria-label={`${s.code} counts toward the degree`} onClick={() => store.updateSubject(s.uid, (x) => E.toggleCount(x, 'countsDegree'))} />
    );
  } else if (st === 'enrolled' || st === 'planned') {
    act = (
      <span className="mv">
        <button type="button" aria-label={`Move ${s.code} one session earlier`} disabled={!canShift(s, -1, current)} onClick={() => move(-1)}>◀</button>
        <button type="button" aria-label={`Move ${s.code} one session later`} disabled={!canShift(s, 1, current)} onClick={() => move(1)}>▶</button>
      </span>
    );
  }
  return (
    <div className={`prow${counts ? '' : ' nocount'}`}>
      <span className={`code${s.name ? '' : ' bare'}`}>{s.code}</span>
      <button type="button" className="pname" onClick={() => open(s.uid)}>{s.name || s.code}</button>
      <span className="pcp">{fmt(s.cp, 0)}</span>
      <span className="pst"><StatusPill s={s} current={current} /></span>
      <span className="pact">{act}</span>
    </div>
  );
}

function SessionBlock({ x, current, open }) {
  const now = sessionKey(current);
  const isNow = x.key === now;
  const st = loadState(x.cp);
  const tag = x.key < now
    ? <span className="pill" style={{ '--bc': 'var(--other)' }}>Done</span>
    : isNow ? <span className="pill" style={{ '--bc': 'var(--review)' }}>Now</span>
    : st.k !== 'ok' ? <span className={`pill ${st.k === 'bad' ? 'bad' : 'warn'}`}>{st.label}</span> : null;
  return (
    <div className="psess">
      <div className="psess-head"><h4>{sessionName(x)} {tag}</h4><span className="note">{fmt(x.cp, 0)} cp</span></div>
      {x.subs.length ? x.subs.map((s) => <SubjectRow key={s.uid} s={s} current={current} open={open} />)
        : <div className="note psess-empty">No subjects yet.</div>}
    </div>
  );
}

function FoldGroup({ label, open, onToggle, sessions, cp, children }) {
  return (
    <>
      <div className="pgrp">
        <button type="button" className="pfold" aria-expanded={open} onClick={onToggle}>
          <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>{label}
        </button>
        <span className="note">{open ? '' : `${sessions} session${sessions === 1 ? '' : 's'} · `}{fmt(cp, 0)} cp</span>
      </div>
      {open && children}
    </>
  );
}

function Roadmap({ subjects, current, open, onAdd }) {
  const [folded, setFolded] = useLocalPref('planFolded', {});
  const [showPast, setShowPast] = useLocalPref('planPast', false);
  const g = planGroups(subjects, current);
  const block = (x) => <SessionBlock key={x.key} x={x} current={current} open={open} />;
  const pastCp = g.past.reduce((a, y) => a + y.cp, 0);
  const pastSessions = g.past.reduce((a, y) => a + y.sessions.length, 0);
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Roadmap</h3>
        <button type="button" className="btn sm" onClick={() => onAdd(nextSession(current))}>+ Add subject</button>
      </div>
      <div className="pgrp first"><span className="pgrp-t">This year · {current.year}</span><span className="note">{fmt(g.thisYear.reduce((a, x) => a + x.cp, 0), 0)} cp</span></div>
      {g.thisYear.map(block)}
      {g.later.map((y) => (
        <FoldGroup key={y.year} label={String(y.year)} open={!folded[y.year]} sessions={y.sessions.length} cp={y.cp}
          onToggle={() => setFolded({ ...folded, [y.year]: !folded[y.year] })}>
          {y.sessions.map(block)}
        </FoldGroup>
      ))}
      {g.past.length > 0 && (
        <FoldGroup label={`Past sessions · ${g.past.map((y) => y.year).join(', ')}`} open={showPast} sessions={pastSessions} cp={pastCp}
          onToggle={() => setShowPast(!showPast)}>
          {g.past.flatMap((y) => y.sessions).map(block)}
        </FoldGroup>
      )}
      {!g.later.length && <div className="note">No later sessions yet. Add subject puts one in {sessionName(nextSession(current))}; pick any later session in the form.</div>}
      <div className="note">The switch on finished subjects sets whether they count toward the degree. Arrows move a later subject one session. Tap a name to open the subject.</div>
    </div>
  );
}

function ProgressCard({ subjects, current, total }) {
  const p = degreeProgress(subjects, current, total);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(String(p.total));
  const w = (v) => `${Math.min(100, (v / Math.max(p.total, p.done + p.now + p.planned, 1)) * 100)}%`;
  const save = async (e) => {
    e.preventDefault();
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n > 0 && n <= 1000) { await store.setDegreeTotal(n); setEdit(false); }
  };
  return (
    <div className="card">
      <div className="eyebrow">Degree progress</div>
      <div className="big pbig">{fmt(p.done, 0)}<small> / {fmt(p.total, 0)} cp done</small></div>
      <div className="pbar" role="img" aria-label={`${p.done} cp done, ${p.now} this session, ${p.planned} planned, ${p.left} not planned`}>
        <i className="s-done" style={{ width: w(p.done) }} /><i className="s-now" style={{ width: w(p.now) }} /><i className="s-plan" style={{ width: w(p.planned) }} />
      </div>
      <div className="plegend">
        <span style={{ '--k': 'var(--accent)' }}>Done {fmt(p.done, 0)}</span>
        <span style={{ '--k': 'var(--review)' }}>This session {fmt(p.now, 0)}</span>
        <span style={{ '--k': '#6b6460' }}>Planned {fmt(p.planned, 0)}</span>
        <span style={{ '--k': 'var(--track)' }}>Not planned {fmt(p.left, 0)}</span>
      </div>
      <div className="note">
        {fmt(p.done + p.now, 0)} cp after this session.
        {p.notCounted > 0 && ` ${fmt(p.notCounted, 0)} cp gained but not counted.`}
        {p.over > 0 && ` ${fmt(p.over, 0)} cp more than the degree needs.`}
      </div>
      {edit ? (
        <form className="add-row" onSubmit={save}>
          <label className="ptotal">Degree total (cp)<input className="in" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value)} autoFocus /></label>
          <button type="submit" className="btn sm primary">Save</button>
          <button type="button" className="btn sm ghost" onClick={() => setEdit(false)}>Cancel</button>
        </form>
      ) : (
        <button type="button" className="link" onClick={() => { setText(String(p.total)); setEdit(true); }}>Change degree total ({fmt(p.total, 0)} cp)</button>
      )}
    </div>
  );
}

function FinishCard({ subjects, current, total }) {
  const p = degreeProgress(subjects, current, total);
  const f = finishSession(subjects, current, total);
  const sessions = upcomingLoads(subjects, current).filter((x) => x.key > sessionKey(current)).length;
  return (
    <div className="card">
      <div className="eyebrow">Finish</div>
      <div className="big pbig">{f ? sessionName(f) : 'Not planned yet'}</div>
      <div className="note">{fmt(p.planned, 0)} cp planned over {sessions} later session{sessions === 1 ? '' : 's'}.</div>
      <div>{p.left === 0
        ? <span className="pill ok">Every credit point has a session</span>
        : <span className="pill warn">{fmt(p.left, 0)} cp still need a session</span>}</div>
    </div>
  );
}

const AVG_LABEL = (a) => (a >= 6.95 ? 'all HD' : a === 6 ? 'all D' : a === 5 ? 'all C' : a <= 4.05 ? 'all P'
  : a > 6 ? 'between D and HD' : a > 5 ? 'between C and D' : 'between P and C');

function GpaCard({ subjects }) {
  const [saved, setAvg] = useLocalPref('planAvg', null);
  const avg = saved ?? defaultAvg(subjects);
  const g = gradGpa(subjects, avg);
  return (
    <div className="card">
      <div className="eyebrow">GPA at graduation</div>
      <div className="big pbig">{fmt(g.gpa, 2)}<small> now {fmt(g.offGpa, 2)}</small></div>
      <div className="pslider">
        <label htmlFor="planAvg"><span>Average from here</span><b>{avg.toFixed(1)} grade points, {AVG_LABEL(avg)}</b></label>
        <input id="planAvg" type="range" min="4" max="7" step="0.1" value={avg} onChange={(e) => setAvg(Number(e.target.value))} />
        <div className="pscale" aria-hidden="true"><span>P 4</span><span>C 5</span><span>D 6</span><span>HD 7</span></div>
      </div>
      <div className="pwork">
        <span>Official results so far</span><span className="r">{fmt(g.offCp, 0)} cp</span><span className="r">{fmt(g.offGpa, 2)}</span>
        {g.markCp > 0 && <><span>Subjects with marks, at their grade so far</span><span className="r">{fmt(g.markCp, 0)} cp</span><span className="r">{fmt(g.markGpa, 1)}</span></>}
        <span>Everything else unfinished, at the slider</span><span className="r">{fmt(g.restCp, 0)} cp</span><span className="r">{avg.toFixed(1)}</span>
        <span className="tot">GPA at graduation</span><span className="r tot">{fmt(g.offCp + g.markCp + g.restCp, 0)} cp</span><span className="r tot">{fmt(g.gpa, 2)}</span>
      </div>
      <div className="note">Pass / not graded subjects (GPA switched off on the subject) add credit points but never grade points.</div>
    </div>
  );
}

function LoadCard({ subjects, current }) {
  const loads = upcomingLoads(subjects, current);
  return (
    <div className="card">
      <h3 className="card-title">Load per session</h3>
      {loads.map((x) => (
        <div className="pload" key={x.key}>
          <span>{sessionShort(x)}</span>
          <div className={`pmeter ${x.state.k}`}><i style={{ width: `${Math.min(100, (x.cp / 30) * 100)}%` }} /></div>
          <span className="r">{fmt(x.cp, 0)} cp</span>
        </div>
      ))}
      <div className="note">Above 27 cp needs approval; above 30 cp is over the limit.</div>
    </div>
  );
}

export default function Plan({ subjects, current, open, onAdd, degreeTotal }) {
  const total = degreeTotal ?? DEFAULT_DEGREE_TOTAL;
  return (
    <div className="cols plan-cols">
      <div className="stack plan-list"><Roadmap subjects={subjects} current={current} open={open} onAdd={onAdd} /></div>
      <div className="stack plan-side">
        <ProgressCard subjects={subjects} current={current} total={total} />
        <FinishCard subjects={subjects} current={current} total={total} />
        <GpaCard subjects={subjects} />
        <LoadCard subjects={subjects} current={current} />
      </div>
    </div>
  );
}
