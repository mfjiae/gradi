// Settings → Import from text (layout A, Compact). Paste the text Claude made from screenshots, Preview,
// then Import. Nothing is saved until Import is pressed, and nothing is ever deleted.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db.js';
import * as store from '../lib/store.js';
import { parseImport, planImport, markLabels } from '../lib/importText.js';
import { bandOf, sessionName, fmt } from '../lib/grades.js';
import { Pill } from './ui.jsx';

const TAGS = { new: ['New', '--hd'], update: ['Updated', '--c'], same: ['No change', '--other'], skip: ['Skipped', '--f'] };
const Tag = ({ status }) => <span className="imp-tag" style={{ '--bc': `var(${TAGS[status][1]})` }}>{TAGS[status][0]}</span>;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function Mark({ text, kind = '' }) {
  const blank = text.includes('-/');
  return <span className={`imp-mk ${blank && !kind ? 'blank' : ''} ${kind}`}>{blank ? text.replace('-/', 'not marked · /') : text}</span>;
}

function Result({ s }) {
  if (!s.official) return <span className="imp-none">no result</span>;
  return <span className="imp-res"><Pill band={bandOf(s)} />{s.official.mark != null && <b>{fmt(s.official.mark)}</b>}</span>;
}

function Details({ p }) {
  const s = p.subject;
  if (!s.components.length) return <div className="imp-only">Official result only. No assessment breakdown.</div>;
  const changes = new Map((p.changes ?? []).map((c) => [c.id, c]));
  const changed = (p.changes ?? []).filter((c) => c.changed && !c.isNew).length;
  let head = null;
  if (p.status === 'update' && p.replaced == null) head = `Keeps the ${plural(s.components.length, 'assessment')} saved now.`;
  else if (p.status === 'update') head = `Replaces the ${plural(p.replaced, 'assessment')} saved now with these ${s.components.length}. ${plural(changed, 'mark')} changed.`;
  return (
    <div className="imp-comps">
      {head && <div className="imp-rep">{head}</div>}
      <div className="imp-crow th"><span>Assessment</span><span>Weight</span><span>Marks</span></div>
      {s.components.map((c) => {
        const ch = changes.get(c.id);
        const show = ch?.changed && ch.was;
        return (
          <div className="imp-crow" key={c.id}>
            <span className="imp-cn">{c.name}
              {c.hurdle != null && <em className="imp-hur">hurdle {fmt(c.hurdle)}%</em>}
              {p.status === 'update' && ch?.changed && <em className="imp-chg">{ch.isNew ? 'new' : 'changed'}</em>}
            </span>
            <span className="imp-cw">{fmt(c.weight)}%</span>
            <span className="imp-cm">
              {show && ch.was.map((t, k) => <Mark key={`o${k}`} text={t} kind="old" />)}
              {markLabels(c).map((t, k) => <Mark key={k} text={t} kind={show ? 'new' : ''} />)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Row({ p, open }) {
  const s = p.subject;
  const head = (
    <>
      <span className="imp-code">{s.code}</span>
      <span className="imp-meta">{sessionName(s)} · {fmt(s.cp, 0)} cp{s.name ? ` · ${s.name}` : ''}</span>
      <span className="imp-r"><Result s={s} /></span>
      <span className="imp-t"><Tag status={p.status} /></span>
    </>
  );
  return <details className="imp-sub" open={open}><summary>{head}</summary><Details p={p} /></details>;
}

const HELP = `CODE: Name | Autumn 2026 | 6cp | D 77
Task 1 | 25% | 5/5, 20/20
Quizzes | 30% | Quiz 1=8/10, Quiz 2=-/10
Final exam | 40% | -/100 | hurdle 50`;

export default function ImportCard() {
  const syncOn = !!useLiveQuery(() => db.meta.get('sync'), [])?.token;
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // { plan, problems }
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const runPreview = async () => {
    const { blocks, problems } = parseImport(text);
    const plan = planImport(blocks, await db.subjects.toArray());
    setPreview({ plan, problems });
    setDone(null);
  };
  const runImport = async () => {
    const write = preview.plan.filter((p) => p.status === 'new' || p.status === 'update');
    setBusy(true);
    try {
      await store.importSubjects(write.map((p) => p.subject));
    } finally {
      setBusy(false);
    }
    const n = (st) => preview.plan.filter((p) => p.status === st).length;
    const skipped = preview.problems.filter((p) => p.level === 'skip').map((p) => p.code);
    const did = [n('new') && `added ${plural(n('new'), 'new subject')}`, n('update') && `updated ${plural(n('update'), 'subject')}`].filter(Boolean);
    const parts = [`Done: ${did.join(' and ')}.`];
    if (n('same')) parts.push(`${n('same')} already matched, left as is.`);
    if (skipped.length) parts.push(`Skipped ${skipped.length} (${skipped.join(', ')}).`);
    if (syncOn) parts.push('It will reach your other devices in a moment.');
    setDone(parts.join(' '));
    setPreview(null);
    setText('');
  };
  const clear = () => { setText(''); setPreview(null); setDone(null); };

  const plan = preview?.plan ?? [];
  const count = (st) => plan.filter((p) => p.status === st).length;
  const toWrite = count('new') + count('update');
  const skips = (preview?.problems ?? []).filter((p) => p.level === 'skip');
  const msgs = (preview?.problems ?? []).filter((p) => p.level !== 'skip');
  const firstUpdate = plan.findIndex((p) => p.status === 'update');

  return (
    <div className="card imp">
      <h3 className="card-title">Import from text</h3>
      <div className="note">Paste text Claude made from your screenshots. <b className="imp-strong">Nothing is saved until you press Import.</b> A subject with the same code, year and session is updated. Others are added. Nothing is ever deleted.</div>
      <textarea id="import-text" className="in" rows={9} spellCheck="false" autoCapitalize="off" autoCorrect="off" value={text}
        placeholder={'Paste the text here, for example:\nSAMPLE_A | Autumn 2026 | 6cp\nTask 1 | 25% | 5/5, 20/20'}
        onChange={(e) => { setText(e.target.value); setPreview(null); }} />
      <div className="add-row">
        <button type="button" className="btn sm primary" disabled={!text.trim()} onClick={runPreview}>Preview</button>
        <button type="button" className="btn sm ghost" disabled={!text && !preview && !done} onClick={clear}>Clear</button>
      </div>
      <details className="imp-help" open={!text && !preview && !done}>
        <summary>Text format</summary>
        <pre>{HELP}</pre>
        <ul>
          <li>First line of a subject: code, an optional <code>: name</code>, session and year, credit points (6 if left out), then the official result if there is one (<code>D 77</code>, <code>HD</code>, <code>PASS</code>).</li>
          <li>One line per assessment: name, weight, marks. One mark is a single mark. Several marks, separated by commas, are parts.</li>
          <li><code>5/5</code> is score/max. <code>-/100</code> is not marked or hidden. Name a part with <code>Quiz 1=8/10</code>, otherwise it is Part 1, Part 2.</li>
          <li>Optional at the end of a line: <code>hurdle 50</code>. Optional on the first line: <code>target 85</code>, <code>no gpa</code>, <code>no wam</code>.</li>
          <li>A blank line starts the next subject. An updated subject keeps its saved assessments if you paste only its first line.</li>
        </ul>
      </details>

      {preview && (
        <div className="stack">
          {plan.length + skips.length === 0 ? <div className="warnbox">No subjects found. Each subject starts with a line like SAMPLE_A | Autumn 2026 | 6cp.</div> : (
            <div className="imp-sum">
              {[['update', 'updated'], ['new', 'new'], ['same', 'no change'], ['skip', 'skipped']].map(([st, w]) => {
                const k = st === 'skip' ? skips.length : count(st);
                return k > 0 && <span key={st} className="imp-tag" style={{ '--bc': `var(${TAGS[st][1]})` }}>{k} {w}</span>;
              })}
            </div>
          )}
          {msgs.length > 0 && (
            <div className="imp-msgs">
              {msgs.map((m, k) => (
                <div key={k} className={m.level === 'warn' ? 'imp-msg warn' : 'imp-msg bad'}>
                  {m.code ? `${m.code}, ` : ''}line {m.line}: {m.text}{m.level === 'error' && m.code ? ' This subject is skipped.' : ''}
                </div>
              ))}
            </div>
          )}
          <div className="imp-list">
            {plan.map((p, k) => <Row key={p.subject.uid} p={p} open={k === firstUpdate} />)}
            {skips.map((p) => (
              <div className="imp-sub flat" key={`skip${p.line}`}>
                <span className="imp-code">{p.code}</span><span className="imp-meta">line {p.line}</span><span className="imp-r" /><span className="imp-t"><Tag status="skip" /></span>
              </div>
            ))}
          </div>
          {plan.length + skips.length > 0 && (
            <>
              <div className="add-row">
                <button type="button" className="btn sm primary" disabled={!toWrite || busy} onClick={runImport}>
                  {busy ? 'Importing…' : toWrite ? `Import ${plural(toWrite, 'subject')}` : 'Nothing to import'}
                </button>
                <button type="button" className="btn sm ghost" onClick={() => setPreview(null)}>Cancel</button>
              </div>
              <div className="note">
                Nothing is deleted.{skips.length ? ` Fix the lines above and press Preview again to include ${skips.map((p) => p.code).join(', ')}.` : ''}
              </div>
            </>
          )}
        </div>
      )}

      {done && (
        <>
          <div className="okbox" role="status">{done}</div>
          <div className="add-row">
            <button type="button" className="btn sm" onClick={() => { window.location.hash = '/subjects'; }}>Open Subjects</button>
            <button type="button" className="btn sm ghost" onClick={() => { setDone(null); document.getElementById('import-text')?.focus(); }}>Import more</button>
          </div>
        </>
      )}
    </div>
  );
}
