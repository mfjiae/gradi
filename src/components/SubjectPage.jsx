// Subject page. Current subject: Marks on the left; "What do I need?" and "What if" on the right.
// Past subject (official result): S2 = marks breakdown on the left, official result card on the right.
import { useState } from 'react';
import { calc, needed, bandOf, band, result, fmt, isNum, defaultWhatIf, BANDS, FAIL, ceil1, sessionName } from '../lib/grades.js';
import * as E from '../lib/edit.js';
import { Icon, Pill, Ladder, Field } from './ui.jsx';
import { useArm } from './hooks.js';

function SubjectHead({ s, r, onEdit, onDelete, arm }) {
  return (
    <div className="card-head">
      <div>
        <div className="mid">{s.code} <Pill band={bandOf(s, r)} /></div>
        <div className="note">
          {sessionName(s)} · {s.name ? `${s.name} · ` : ''}{fmt(s.cp, 0)} credit points · {s.official ? 'official result' : `on track for ${r.avg == null ? '—' : `${fmt(r.avg)}%`}`}
        </div>
      </div>
      <div className="add-row">
        <button type="button" className="btn sm ghost" onClick={onEdit}>Edit details</button>
        <button type="button" className="btn sm ghost danger" onClick={() => arm.tap('subject', onDelete)}>
          {arm.armed === 'subject' ? 'Tap again to delete' : 'Delete subject'}
        </button>
      </div>
    </div>
  );
}

function CompEditor({ s, r, save, arm }) {
  const label = (c) => c.name || 'component';
  return (
    <div className="stack">
      {s.components.length > 0 && Math.abs(r.W - 100) > 0.001 && (
        <div className="warnbox">Weights add up to {fmt(r.W)}%, not 100%. Marks are scaled to 100 for now.</div>
      )}
      {r.comps.length === 0 && <div className="empty">No components yet. Add the first one below.</div>}
      {r.comps.map(({ c, pct, pts, maxPts, hs }) => (
        <div className="comp" key={c.id}>
          <div className="comp-head">
            <Field value={c.name} aria-label="Component name" onCommit={(v) => save((x) => E.setCompField(x, c.id, 'name', v))} />
            <span className="wt"><Field className="numw" numeric value={c.weight} aria-label={`${label(c)} weight percent`} onCommit={(v) => save((x) => E.setCompField(x, c.id, 'weight', v))} />%</span>
          </div>
          <div className="comp-sum">
            <span>{fmt(pts)} of {fmt(maxPts)} pts{pct != null ? ` · ${fmt(pct)}% so far` : ''}</span>
            {hs === 'fail' && <span className="pill bad">Hurdle failed</span>}
            {hs === 'risk' && <span className="pill warn">Below hurdle so far</span>}
          </div>
          {c.single ? (
            <div className="irow">
              <span className="inl">Mark</span>
              <span className="inl">
                <Field className="num" numeric value={c.items[0]?.score} placeholder="—" aria-label={`${label(c)} score`} onCommit={(v) => save((x) => E.setPartField(x, c.id, c.items[0].id, 'score', v))} />
                {' / '}
                <Field className="num" numeric value={c.items[0]?.max} aria-label={`${label(c)} out of`} onCommit={(v) => save((x) => E.setPartField(x, c.id, c.items[0].id, 'max', v))} />
                <span className="pc">{pct == null ? '—' : `${fmt(pct)}%`}</span>
              </span>
            </div>
          ) : (
            <>
              {c.items.map((i) => {
                const g = isNum(i.score) && isNum(i.max) && i.max > 0;
                return (
                  <div className="irow part" key={i.id}>
                    <Field wrap value={i.name} aria-label="Part name" onCommit={(v) => save((x) => E.setPartField(x, c.id, i.id, 'name', v))} />
                    <span className="inl">
                      <Field className="num" numeric value={i.score} placeholder="—" aria-label={`${i.name} score`} onCommit={(v) => save((x) => E.setPartField(x, c.id, i.id, 'score', v))} />
                      {' / '}
                      <Field className="num" numeric value={i.max} aria-label={`${i.name} out of`} onCommit={(v) => save((x) => E.setPartField(x, c.id, i.id, 'max', v))} />
                      <span className="pc">{g ? `${fmt((i.score / i.max) * 100)}%` : '—'}</span>
                      <button type="button" className="link danger" aria-label={`Remove ${i.name}`} disabled={c.items.length < 2} onClick={() => save((x) => E.removePart(x, c.id, i.id))}>✕</button>
                    </span>
                  </div>
                );
              })}
              <div className="opts">
                <button type="button" className="link" onClick={() => save((x) => E.addPart(x, c.id))}>+ Add part</button>
                <span className="note">Parts are weighted by points.</span>
              </div>
            </>
          )}
          <div className="opts">
            <button type="button" className="link" onClick={() => save((x) => E.toggleSingle(x, c.id))}>{c.single ? 'Split into quizzes / labs' : 'Make single mark'}</button>
            <span className="wt">Hurdle ≥ <Field className="numw" numeric value={c.hurdle} placeholder="none" aria-label={`${label(c)} hurdle minimum percent`} onCommit={(v) => save((x) => E.setCompField(x, c.id, 'hurdle', v))} />%</span>
            <button type="button" className="link danger" onClick={() => arm.tap(`c${c.id}`, () => save((x) => E.removeComponent(x, c.id)))}>
              {arm.armed === `c${c.id}` ? 'Tap again to remove' : 'Remove'}
            </button>
          </div>
        </div>
      ))}
      <div className="add-row">
        {[['assignment', 'Assignment'], ['quizzes', 'Quizzes'], ['labs', 'Labs'], ['exam', 'Exam']].map(([k, t]) => (
          <button type="button" key={k} className="btn sm" onClick={() => save((x) => E.addComponent(x, k))}><Icon name="plus" />{t}</button>
        ))}
      </div>
    </div>
  );
}

function NeedResult({ r }) {
  const hurdles = r.comps.filter((x) => isNum(x.c.hurdle) && x.cg < 0.999).map((x) => `${x.c.name}: at least ${fmt(x.c.hurdle, 0)}% to pass`);
  const hbox = hurdles.length > 0 && <div className="note">Hurdles still open: {hurdles.join('; ')}.</div>;
  if (r.hurdleFail) {
    return <div className="warnbox"><b>Hurdle not met.</b> {r.hurdleFail.c.name} is {fmt(r.hurdleFail.pct)}%, below the {fmt(r.hurdleFail.c.hurdle, 0)}% hurdle. Check your subject outline: this usually fails the subject whatever the total.</div>;
  }
  if (r.state === 'empty') return <div className="empty">Add assessment components and weights to see what you need.</div>;
  if (r.state === 'secured') return <><div className="need"><div className="big ok">Secured</div><div className="note">You have banked {fmt(r.banked)} out of 100, at or above your target of {fmt(r.T, 0)}.</div></div>{hbox}</>;
  if (r.state === 'missed') return <div className="need"><div className="big warn">{fmt(r.banked)}</div><div className="note">Final mark, below your target of {fmt(r.T, 0)}. No marks left to earn.</div></div>;
  if (r.state === 'out') return <><div className="need"><div className="big bad">Out of reach</div><div className="note">Even 100% on everything left gives {fmt(r.best)}. Lower the target to {fmt(Math.floor(r.best), 0)} or less.</div></div>{hbox}</>;
  const nd = needed(r);
  return (
    <>
      <div className="need"><div className="big go">{fmt(nd.pct)}%</div><div className="note">average needed on the remaining {fmt(r.remaining)}% of the subject to reach {fmt(r.T, 0)}</div></div>
      <div className="plist">
        {nd.parts.map((p) => (
          <div key={p.iid}><span>{p.label} <span className="note">({fmt(p.pts)} pts)</span></span><b>{p.score != null ? `${fmt(p.score)}/${fmt(p.max, 0)} · ` : ''}{fmt(nd.pct)}%</b></div>
        ))}
      </div>
      {hbox}
    </>
  );
}

function TargetBlock({ s, r, save }) {
  return (
    <>
      <div className="chips">
        <span className="note">Target</span>
        {BANDS.slice(0, 4).reverse().map((b) => (
          <button type="button" key={b.k} className={`chip ${r.T === b.min ? 'on' : ''}`} aria-pressed={r.T === b.min} onClick={() => save((x) => E.setTarget(x, b.min))}>{b.k} {b.min}</button>
        ))}
        <Field className="numw" numeric value={s.target} aria-label="Custom target" onCommit={(v) => save((x) => E.setTarget(x, v))} />
      </div>
      <NeedResult r={r} />
    </>
  );
}

function WhatIf({ s, r }) {
  const [hyp, setHyp] = useState({});
  const value = (p) => hyp[p.iid] ?? defaultWhatIf(r);
  if (!r.pending.length || r.state === 'empty') return <div className="note">Nothing left to mark. Add components or clear a mark to try what-ifs.</div>;
  const pr = calc(s, value);
  const b = pr.proj == null ? null : pr.hurdleFail ? FAIL : band(pr.proj);
  const setAll = (v) => setHyp(Object.fromEntries(r.pending.map((p) => [p.iid, v])));
  return (
    <>
      <div className="chips">
        <button type="button" className="chip" onClick={() => setAll(Math.round(r.avg ?? 70))}>All at my average</button>
        <button type="button" className="chip" onClick={() => setAll(Math.max(0, Math.min(100, Math.ceil(ceil1(r.req ?? 0)))))}>All at what I need</button>
      </div>
      {r.pending.map((p) => (
        <div className="sl" key={p.iid}>
          <label htmlFor={`wi-${p.iid}`}><span>{p.label}</span><span className="note">{fmt(p.pts)} pts</span></label>
          <input id={`wi-${p.iid}`} type="range" min="0" max="100" step="1" value={value(p)} aria-label={`${p.label} mark`}
            onChange={(e) => setHyp({ ...hyp, [p.iid]: Number(e.target.value) })} />
          <output>{value(p)}%</output>
        </div>
      ))}
      <div className="result">
        <div><div className="note">If you score these marks</div><div className="mid">{fmt(pr.proj)} <Pill band={b} /></div></div>
        <div className="stat"><b>{b ? b.gp : '—'}</b><span>grade points</span></div>
      </div>
      <Ladder r={pr} proj />
    </>
  );
}

function OfficialCard({ s, r, save }) {
  const res = result(s);
  const pass = s.official.grade === 'PASS';
  const sw = (k, label) => (
    <button type="button" className={`chip ${s[k] === false ? '' : 'on'}`} aria-pressed={s[k] !== false} onClick={() => save((x) => E.toggleCount(x, k))}>{label}</button>
  );
  const gap = r.gradedPts > 0
    ? `Marks breakdown adds to ${fmt(r.banked)} of ${fmt(r.gradedPts)} entered${isNum(s.official.mark) ? `. Official mark ${s.official.mark}.` : '.'}`
    : 'No breakdown entered.';
  return (
    <div className="card tint-g">
      <div className="eyebrow" style={{ color: 'var(--hd)' }}>Official result</div>
      <div className="mid"><Pill band={bandOf(s, r)} /> {res.mark ?? ''}</div>
      <div className="stat-row">
        <div className="stat"><b>{fmt(s.cp, 0)}</b><span>credit points</span></div>
        <div className="stat"><b>{res.gp ?? '—'}</b><span>grade points</span></div>
      </div>
      {pass ? <div className="note">Pass, not graded. Not in GPA or WAM.</div> : (
        <div className="chips">
          <span className="note">Counts in</span>
          {sw('countsGpa', 'GPA')}
          {res.mark != null ? sw('countsWam', 'WAM') : <span className="note">No mark, so not in WAM</span>}
        </div>
      )}
      <div className="note">{gap} The official result is used; the breakdown is for reference.</div>
    </div>
  );
}

export default function SubjectPage({ s, save, onEdit, onDelete, back }) {
  const arm = useArm();
  if (!s) {
    return <><div className="empty">Subject not found.</div><div><button type="button" className="btn" onClick={back}>Back to subjects</button></div></>;
  }
  const r = calc(s);
  const crumb = <div><button type="button" className="crumb" onClick={back}><Icon name="back" />Subjects</button></div>;
  if (s.official) {
    return (
      <>
        {crumb}
        <div className="card"><SubjectHead s={s} r={r} onEdit={onEdit} onDelete={onDelete} arm={arm} /></div>
        <div className="cols">
          <div className="card"><h3 className="card-title">Marks breakdown</h3><div className="note">Reference only. Hidden exam marks are left blank.</div><CompEditor s={s} r={r} save={save} arm={arm} /></div>
          <div className="stack"><OfficialCard s={s} r={r} save={save} /></div>
        </div>
      </>
    );
  }
  return (
    <>
      {crumb}
      <div className="card"><SubjectHead s={s} r={r} onEdit={onEdit} onDelete={onDelete} arm={arm} /><Ladder r={r} legend /></div>
      <div className="cols">
        <div className="card"><h3 className="card-title">Marks</h3><CompEditor s={s} r={r} save={save} arm={arm} /></div>
        <div className="stack">
          <div className="card"><h3 className="card-title" style={{ '--head': 'var(--hd)' }}>What do I need?</h3><TargetBlock s={s} r={r} save={save} /></div>
          <div className="card"><h3 className="card-title" style={{ '--head': 'var(--review)' }}>What if</h3><WhatIf key={s.uid} s={s} r={r} /></div>
        </div>
      </div>
    </>
  );
}
