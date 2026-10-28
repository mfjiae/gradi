// Study → Import: paste task lines (one per line), see the preview as you type, then Add. Same subject + same
// name updates that task; Done tasks are left alone; nothing is deleted. Parser: lib/importTasks.js.
import { useEffect, useRef, useState } from 'react';
import { planTaskImport, tasksToSave } from '../lib/importTasks.js';
import { dueText, linkLabel, daysBetween, sydneyNow } from '../lib/tasks.js';
import * as store from '../lib/store.js';
import { Icon } from './ui.jsx';

const KIND = { new: ['New', '--hd'], update: ['Update', '--c'], same: ['No change', '--other'], done: ['Done, left alone', '--other'], error: ['Skipped', '--f'] };
const CHANGE = { due: 'date', time: 'time', link: 'link', details: 'note', important: 'important', repeat: 'repeat', remind: 'reminder' };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const EXAMPLE = `SAMPLE_A | Final exam | 20 Nov 09:30 | link Final exam | note 2 h + reading
SAMPLE_A | Report | 14 Nov 23:00 | link Report`;

function Row({ r, today }) {
  const [label, color] = KIND[r.kind];
  const t = r.task;
  const meta = [];
  if (t) {
    meta.push(dueText(t) || 'No date');
    const l = linkLabel(r.subject, t.link);
    if (l) meta.push(`linked to ${l}`);
    if (t.status !== 'done' && t.due && (/exam/i.test(t.title) || /exam/i.test(l ?? ''))) {
      const n = daysBetween(today, t.due);
      if (n >= 0) meta.push(`countdown: ${n === 0 ? 'today' : plural(n, 'day')}`);
    }
    if (r.kind === 'update') meta.push(`changes ${r.changes.map((c) => CHANGE[c]).join(', ')}`);
  }
  return (
    <div className={`ti-row ${r.kind === 'error' ? 'bad' : r.warnings.length ? 'warn' : ''}`}>
      <span className="imp-tag" style={{ '--bc': `var(${color})` }}>{label}</span>
      <span className="ti-code">{r.subject?.code ?? r.code}</span>
      <span className="ti-main">
        <b>{r.title || r.text}</b>
        {meta.length > 0 && <small>{meta.join(' · ')}</small>}
        {r.error && <small className="ti-err">Line {r.line}: {r.error}</small>}
        {r.warnings.map((w, k) => <small key={k} className="ti-warn">⚠ {w}</small>)}
      </span>
    </div>
  );
}

export default function ImportTasks({ tasks, subjects, current, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const today = sydneyNow().date;
  const rows = text.trim() ? planTaskImport(text, { subjects, tasks, current, today }) : [];
  const save = tasksToSave(rows);
  const n = (k) => rows.filter((r) => r.kind === k).length;
  const sum = [n('new') && `${n('new')} new`, n('update') && `${n('update')} updated`, n('same') && `${n('same')} no change`,
    n('done') && `${n('done')} already done`, n('error') && `${n('error')} skipped`].filter(Boolean).join(' · ');
  const btn = !save.length ? 'Nothing to add'
    : n('update') && !n('new') ? `Update ${plural(n('update'), 'task')}`
      : n('update') ? `Add ${n('new')}, update ${n('update')}` : `Add ${plural(n('new'), 'task')}`;

  const run = async () => {
    setBusy(true);
    try { await store.importTasks(save); onClose(); } finally { setBusy(false); }
  };

  return (
    <div className="modal-bg sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal task-modal ti" role="dialog" aria-modal="true" aria-label="Import tasks">
        <div className="card-head">
          <h3 className="card-title">Import tasks</h3>
          <button type="button" className="link mute" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <textarea ref={box} className="in ti-text" rows={6} spellCheck="false" autoCapitalize="off" autoCorrect="off" value={text}
          placeholder={`One task per line, for example:\n${EXAMPLE}`} aria-label="Task lines" onChange={(e) => setText(e.target.value)} />
        <details className="imp-help" open={!text.trim()}>
          <summary>Text format</summary>
          <ul>
            <li>One task per line: <code>SUBJECT | task name | date time</code>. Only the subject code and name are needed.</li>
            <li>Dates: <code>3 Nov</code>, <code>Tue 3 Nov 11:00 PM</code>, <code>3/11</code>, <code>2026-11-03 23:00</code>. No year = the next one coming up.</li>
            <li>Optional, any order: <code>link Lab 4</code> (a part or a single-mark assessment, or <code>Labs › Lab 4</code>), <code>note …</code>, <code>important</code>, <code>repeat weekly</code>, <code>remind 2 days</code>.</li>
            <li>Same subject + same name again updates that task instead of adding a copy. Done tasks are left alone. Nothing is deleted.</li>
          </ul>
        </details>
        {rows.length > 0 && (
          <>
            <div className="ti-sum">Preview · {sum}</div>
            <div className="ti-list">{rows.map((r) => <Row key={r.line} r={r} today={today} />)}</div>
          </>
        )}
        <div className="add-row tk-acts">
          <span className="grow" />
          <button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn sm primary" disabled={!save.length || busy} onClick={run}>{busy ? 'Adding…' : btn}</button>
        </div>
      </div>
    </div>
  );
}
