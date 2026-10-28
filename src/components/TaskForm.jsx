// New task / edit task pop-up (Full, Tasknote style): a big title, an icon row for status, important, due date,
// repeat and reminder (a dot shows which are set; tap one to open its options), then subject, link to an
// assessment, and details. Slides up as a sheet on phones.
import { useEffect, useRef, useState } from 'react';
import { STATUSES, STATUS_LABEL, REPEATS, REPEAT_LABEL, REMINDS, remindLabel, linkOptions, newTask, addDays, dateLabel, timeLabel, isDate, sydneyNow, weekStart } from '../lib/tasks.js';
import { isCurrent } from '../lib/grades.js';
import * as store from '../lib/store.js';
import { Icon } from './ui.jsx';
import { useArm, useLocalPref } from './hooks.js';

const linkKey = (l) => (l ? `${l.cid}/${l.iid ?? ''}` : '');

export default function TaskForm({ task, preset = {}, subjects, current, onClose }) {
  const editing = !!task;
  const [lastSubject, setLastSubject] = useLocalPref('lastSubject', '');
  const pickDefault = () => {
    const ok = (uid) => uid && subjects.some((s) => s.uid === uid);
    if (ok(preset.subjectUid)) return preset.subjectUid;
    if (ok(lastSubject)) return lastSubject;
    return (subjects.find((s) => isCurrent(s, current)) ?? subjects[0])?.uid ?? '';
  };
  const src = task ?? preset;
  const [f, setF] = useState(() => ({
    title: src.title ?? '',
    status: src.status ?? 'open',
    important: !!src.important,
    due: src.due ?? '',
    time: src.time ?? '',
    repeat: src.repeat ?? null,
    remind: src.remind ?? null,
    details: src.details ?? '',
    subjectUid: task ? task.subjectUid ?? '' : pickDefault(),
    link: linkKey(src.link),
  }));
  const [panel, setPanel] = useState(null);
  const [err, setErr] = useState('');
  const arm = useArm();
  const first = useRef(null);
  useEffect(() => {
    if (!editing) first.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, editing]);

  const set = (k, v) => { setErr(''); setF((p) => ({ ...p, [k]: v })); };
  const subject = subjects.find((s) => s.uid === f.subjectUid);
  const groups = linkOptions(subject);
  const allParts = groups.flatMap((g) => g.parts);
  const partFor = (key) => allParts.find((p) => linkKey(p) === key);
  const hasDue = isDate(f.due);

  const pickLink = (key) => {
    const was = partFor(f.link);
    const p = partFor(key);
    setErr('');
    setF((x) => ({ ...x, link: key, title: p && (!x.title.trim() || x.title === was?.title) ? p.title : x.title }));
  };
  const pickSubject = (uid) => setF((x) => ({ ...x, subjectUid: uid, link: '' }));

  const now = sydneyNow();
  const quick = [['Today', now.date], ['Tomorrow', addDays(now.date, 1)], ['Next Monday', addDays(weekStart(now.date), 7)]];
  const summary = [
    f.status !== 'open' && STATUS_LABEL[f.status],
    f.important && 'Important',
    hasDue && `Due ${dateLabel(f.due)}${f.time ? `, ${timeLabel(f.time)}` : ''}`,
    hasDue && f.repeat && REPEAT_LABEL[f.repeat],
    hasDue && f.remind != null && `Remind ${remindLabel(f.remind).toLowerCase()}`,
  ].filter(Boolean).join(' · ');

  const submit = async (e) => {
    e.preventDefault();
    const p = partFor(f.link);
    const title = f.title.trim() || p?.title || '';
    if (!title) { setErr('Give the task a name.'); first.current?.focus(); return; }
    if (!subject) { setErr('Pick a subject. Every task belongs to one.'); return; }
    const fields = {
      title, status: f.status, important: f.important, due: hasDue ? f.due : null, time: hasDue && f.time ? f.time : null,
      repeat: hasDue ? f.repeat : null, remind: hasDue ? f.remind : null, details: f.details, subjectUid: subject.uid,
      link: p ? { cid: p.cid, iid: p.iid } : null,
    };
    if (editing) await store.saveTask(task.uid, fields);
    else await store.putTask(newTask(fields));
    setLastSubject(subject.uid);
    onClose();
  };

  const icon = (id, name, label, on) => (
    <button type="button" className={`ib ${on ? 'set' : ''} ${panel === id ? 'open' : ''}`} aria-label={label} title={label}
      aria-expanded={id === 'important' ? undefined : panel === id} aria-pressed={id === 'important' ? f.important : undefined}
      onClick={() => (id === 'important' ? set('important', !f.important) : setPanel(panel === id ? null : id))}>
      <Icon name={name} className={id === 'important' && f.important ? 'fill-star' : ''} />
    </button>
  );
  const chip = (on, label, onClick, disabled = false) => (
    <button type="button" key={label} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={disabled} onClick={onClick}>{label}</button>
  );
  const cur = subjects.filter((s) => isCurrent(s, current));
  const other = subjects.filter((s) => !isCurrent(s, current));

  return (
    <div className="modal-bg sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal task-modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit task' : 'New task'} onSubmit={submit}>
        <div className="card-head">
          <h3 className="card-title">{editing ? 'Edit task' : 'New task'}</h3>
          <button type="button" className="link mute" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <input ref={first} className="in tk-title" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="What needs to be done?" aria-label="Task name" />
        <div className="ib-row">
          {icon('status', 'status', `Status: ${STATUS_LABEL[f.status]}`, f.status !== 'open')}
          {icon('important', 'star', f.important ? 'Important (tap to unmark)' : 'Mark important', f.important)}
          {icon('due', 'calendar', 'Due date', hasDue)}
          {icon('repeat', 'repeat', 'Repeat', hasDue && !!f.repeat)}
          {icon('remind', 'bell', 'Reminder', hasDue && f.remind != null)}
          <span className="note ib-sum">{summary || 'Status · Important · Due date · Repeat · Reminder'}</span>
        </div>
        {panel === 'status' && (
          <div className="ib-panel chips">{STATUSES.map((s) => chip(f.status === s, STATUS_LABEL[s], () => set('status', s)))}</div>
        )}
        {panel === 'due' && (
          <div className="ib-panel">
            <div className="chips">{quick.map(([l, d]) => chip(f.due === d, l, () => set('due', d)))}</div>
            <div className="due-in">
              <input type="date" className="in" value={f.due} aria-label="Due date" onChange={(e) => set('due', e.target.value)} />
              <input type="time" className="in" value={f.time} aria-label="Due time (optional)" disabled={!hasDue} onChange={(e) => set('time', e.target.value)} />
              {(f.due || f.time) && <button type="button" className="link mute" onClick={() => setF((x) => ({ ...x, due: '', time: '' }))}>Clear</button>}
            </div>
          </div>
        )}
        {panel === 'repeat' && (
          <div className="ib-panel">
            <div className="chips">
              {chip(!f.repeat, 'Never', () => set('repeat', null), !hasDue)}
              {REPEATS.map((r) => chip(f.repeat === r, REPEAT_LABEL[r], () => set('repeat', r), !hasDue))}
            </div>
            {!hasDue && <div className="note">Set a due date first.</div>}
            {hasDue && f.repeat && <div className="note">Ticking it Done adds the next one.</div>}
          </div>
        )}
        {panel === 'remind' && (
          <div className="ib-panel">
            <div className="chips">
              {chip(f.remind == null, 'None', () => set('remind', null), !hasDue)}
              {REMINDS.map((r) => chip(f.remind === r, remindLabel(r), () => set('remind', r), !hasDue))}
            </div>
            <div className="note">{hasDue ? 'Reminders show in Due soon on Home, nothing is sent to your phone.' : 'Set a due date first.'}</div>
          </div>
        )}
        <label className="fr">Subject
          {subjects.length ? (
            <select className="in" value={f.subjectUid} onChange={(e) => pickSubject(e.target.value)}>
              {!subject && <option value="">Pick a subject</option>}
              {cur.length > 0 && <optgroup label="This session">{cur.map((s) => <option key={s.uid} value={s.uid}>{s.code}{s.name ? ` · ${s.name}` : ''}</option>)}</optgroup>}
              {other.length > 0 && <optgroup label="Other sessions">{other.map((s) => <option key={s.uid} value={s.uid}>{s.code} · {s.session} {s.year}</option>)}</optgroup>}
            </select>
          ) : <span className="note">Add a subject first. Every task belongs to one.</span>}
        </label>
        <label className="fr">Link to
          <select className="in" value={partFor(f.link) ? f.link : ''} disabled={!groups.length} onChange={(e) => pickLink(e.target.value)}>
            <option value="">{groups.length ? 'Nothing (optional)' : 'No assessments in this subject'}</option>
            {groups.map((g) => (
              <optgroup key={g.name + g.parts[0].cid} label={g.name}>{g.parts.map((p) => <option key={linkKey(p)} value={linkKey(p)}>{p.label}</option>)}</optgroup>
            ))}
          </select>
        </label>
        {partFor(f.link) && <div className="note">Entering this mark in the subject ticks the task Done.</div>}
        <label className="fr">Details
          <textarea className="in tk-details" rows={3} value={f.details} placeholder="Add more details…" onChange={(e) => set('details', e.target.value)} />
        </label>
        {err && <div className="warnbox" role="alert">{err}</div>}
        <div className="add-row tk-acts">
          {editing && (
            <button type="button" className="btn sm ghost danger" onClick={() => arm.tap('task', async () => { await store.deleteTask(task.uid); onClose(); })}>
              {arm.armed === 'task' ? 'Tap again to delete' : 'Delete'}
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn sm primary" disabled={!subjects.length}>Save</button>
        </div>
      </form>
    </div>
  );
}
