// After adding an assessment (or a part) in Marks: each new part becomes a study task, with an optional due date.
// "Skip, no dates" still adds them (they wait under No date yet); the ✕ closes without adding any.
import { useEffect, useState } from 'react';
import { newTask, isDate } from '../lib/tasks.js';
import * as store from '../lib/store.js';
import { Icon } from './ui.jsx';

export default function DuePrompt({ subject, parts, onClose }) {
  const [dates, setDates] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const key = (p) => `${p.cid}/${p.iid}`;
  const comps = [...new Set(parts.map((p) => p.comp))];
  const heading = comps.length === 1 ? `${parts.length === 1 && parts[0].title !== comps[0] ? parts[0].title : comps[0]} added to Study` : 'Added to Study';
  const add = async (withDates) => {
    setBusy(true);
    const base = Date.now();
    await store.addTasks(parts.map((p, k) => newTask({
      title: p.title, subjectUid: subject.uid, link: { cid: p.cid, iid: p.iid },
      due: withDates && isDate(dates[key(p)]) ? dates[key(p)] : null, order: base + k,
    }, base)));
    onClose();
  };
  const n = parts.length;
  return (
    <div className="modal-bg sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal task-modal" role="dialog" aria-modal="true" aria-label={heading}>
        <div className="card-head">
          <h3 className="card-title">{heading}</h3>
          <button type="button" className="link mute" aria-label="Close without adding tasks" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="note">{n === 1 ? 'It becomes a task' : 'Each part becomes a task'} under {subject.code}. Set a due date now or later. A mark you enter ticks its task Done.</div>
        <div className="dp-list">
          {parts.map((p) => (
            <label className="dp-row" key={key(p)}>
              <span>{p.title}</span>
              <input type="date" className="in" value={dates[key(p)] ?? ''} aria-label={`${p.title} due date`} onChange={(e) => setDates({ ...dates, [key(p)]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="add-row tk-acts">
          <span className="grow" />
          <button type="button" className="btn sm ghost" disabled={busy} onClick={() => add(false)}>Skip, no dates</button>
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => add(true)}>Add {n} task{n === 1 ? '' : 's'}</button>
        </div>
      </div>
    </div>
  );
}
