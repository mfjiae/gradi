// Subject hub (M8, Hub B placement A, locked 15 Nov 2026): link buttons under the title, the exam line, and the
// Revision topics, Notes and Key contacts cards. All saved on the subject (src/lib/hub.js) through `save`.
// Empty cards shrink to one "+ Add" line. `hl` = an item id to highlight (picked in quick search).
import { useEffect, useRef, useState } from 'react';
import * as H from '../lib/hub.js';
import { dueText, daysText } from '../lib/tasks.js';
import { Icon, Field } from './ui.jsx';

const isHl = (hl, id) => hl?.id === id;

function AddForm({ fields, onAdd, onClose, label }) {
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.k, ''])));
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  const ok = fields.every((f) => !f.required || v[f.k].trim());
  const submit = (e) => { e.preventDefault(); if (ok) { onAdd(v); onClose(); } };
  return (
    <form className="hub-form" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      {fields.map((f, k) => (
        <input key={f.k} ref={k === 0 ? first : null} className="in" placeholder={f.ph} aria-label={f.ph} value={v[f.k]}
          inputMode={f.mode} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
      ))}
      <div className="add-row">
        <button type="submit" className="btn sm primary" disabled={!ok}>{label}</button>
        <button type="button" className="btn sm ghost" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// Link buttons under the title. Tap opens the link in a new tab; Edit turns them into editable rows.
export function HubLinks({ s, save, hl, showExamAdd, onExamAdd }) {
  const { links } = H.getHub(s);
  const [mode, setMode] = useState(null); // null | 'add' | 'edit'
  if (mode === 'edit') {
    return (
      <div className="card hub-edit">
        <h3 className="card-title">Links</h3>
        {links.map((l) => (
          <div className="hub-erow" key={l.id}>
            <Field value={l.name} aria-label="Link name" onCommit={(v) => save((x) => H.updateLink(x, l.id, { name: v }))} />
            <Field value={l.url} aria-label={`${l.name} address`} onCommit={(v) => save((x) => H.updateLink(x, l.id, { url: v }))} />
            <button type="button" className="link danger" aria-label={`Remove ${l.name}`} onClick={() => save((x) => H.removeItem(x, 'link', l.id))}>✕</button>
          </div>
        ))}
        <div><button type="button" className="btn sm" onClick={() => setMode(null)}>Done</button></div>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="hub-strip">
        {links.map((l) => (
          <a key={l.id} id={`hub-${l.id}`} className={`lchip ${isHl(hl, l.id) ? 'flash' : ''}`} href={l.url} target="_blank" rel="noopener noreferrer" title={H.hostOf(l.url)}>
            <Icon name="link" />{l.name}
          </a>
        ))}
        <button type="button" className="lchip add" onClick={() => setMode('add')}>+ Link</button>
        {showExamAdd && <button type="button" className="lchip add" onClick={onExamAdd}>+ Exam info</button>}
        {links.length > 0 && <button type="button" className="link mute" onClick={() => setMode('edit')}>Edit links</button>}
      </div>
      {mode === 'add' && (
        <AddForm label="Add link" onClose={() => setMode(null)} onAdd={(v) => save((x) => H.addLink(x, v))}
          fields={[{ k: 'name', ph: 'Name (Canvas, subject outline…)' }, { k: 'url', ph: 'Address (canvas.uts.edu.au/…)', required: true, mode: 'url' }]} />
      )}
    </div>
  );
}

// The highlighted exam line: the next exam task (name, date, time, countdown) + room and allowed items.
export function ExamLine({ s, save, exam, editing, setEditing, hl }) {
  const { exam: info } = H.getHub(s);
  if (!exam && !info.room && !info.allowed && !editing) return null;
  const when = exam ? (exam.days === 0 ? 'Today' : exam.days === 1 ? 'Tomorrow' : `in ${daysText(exam.days)}`) : null;
  return (
    <div id={`hub-exam-${s.uid}`} className={`exam-line ${isHl(hl, `exam-${s.uid}`) ? 'flash' : ''}`}>
      {editing ? (
        <div className="exam-edit">
          <label className="field">Room<Field value={info.room} placeholder="e.g. CB11.00.405" onCommit={(v) => save((x) => H.setExamInfo(x, { room: v }))} /></label>
          <label className="field">Allowed<Field value={info.allowed} placeholder="e.g. calculator, 1 page of notes" onCommit={(v) => save((x) => H.setExamInfo(x, { allowed: v }))} /></label>
          <div className="note">{exam ? 'Date and time come from the exam task on Study.' : 'For the date and time, add a task with "exam" in its name on Study (or link it to the exam).'}</div>
          <div><button type="button" className="btn sm" onClick={() => setEditing(false)}>Done</button></div>
        </div>
      ) : (
        <>
          <b>{exam ? exam.task.title : 'Exam'}</b>
          <span>{exam ? dueText(exam.task) : 'No date yet'}</span>
          {info.room && <span>Room {info.room}</span>}
          {info.allowed && <span>Allowed: {info.allowed}</span>}
          {when && <span className="cd">{when}</span>}
          <button type="button" className="link mute" onClick={() => setEditing(true)}>{info.room || info.allowed ? 'Edit' : '+ Room and allowed'}</button>
        </>
      )}
    </div>
  );
}

const Empty = ({ children, onClick }) => <button type="button" className="btn sm ghost hub-empty" onClick={onClick}>{children}</button>;

export function TopicsCard({ s, save, hl }) {
  const { topics } = H.getHub(s);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const hlAt = topics.findIndex((t) => isHl(hl, t.id));
  if (!topics.length && !adding) return <Empty onClick={() => setAdding(true)}>+ Add revision topics</Empty>;
  const done = topics.filter((t) => t.done).length;
  const showAll = all || hlAt >= 5;
  const shown = showAll || edit ? topics : topics.slice(0, 5);
  const add = (e) => { e.preventDefault(); if (text.trim()) { save((x) => H.addTopic(x, text)); setText(''); } };
  return (
    <div className="card">
      <h3 className="card-title">Revision topics {topics.length > 0 && <span className="badge">{done} / {topics.length}</span>}</h3>
      {topics.length > 0 && <div className="meter" role="img" aria-label={`${done} of ${topics.length} topics done`}><i style={{ width: `${(100 * done) / topics.length}%` }} /></div>}
      <div>
        {shown.map((t) => (edit ? (
          <div className="hub-erow topic-e" key={t.id}>
            <Field value={t.name} aria-label="Topic" onCommit={(v) => save((x) => H.renameTopic(x, t.id, v))} />
            <button type="button" className="link danger" aria-label={`Remove ${t.name}`} onClick={() => save((x) => H.removeItem(x, 'topic', t.id))}>✕</button>
          </div>
        ) : (
          <label key={t.id} id={`hub-${t.id}`} className={`topic ${t.done ? 'done' : ''} ${isHl(hl, t.id) ? 'flash' : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => save((x) => H.toggleTopic(x, t.id))} />
            <span>{t.name}</span>
          </label>
        )))}
      </div>
      {adding && (
        <form className="hub-form row" onSubmit={add}>
          <input className="in" autoFocus placeholder="New topic, then Enter" aria-label="New topic" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setText(''); } }} />
          <button type="submit" className="btn sm primary" disabled={!text.trim()}>Add</button>
          <button type="button" className="btn sm ghost" onClick={() => { setAdding(false); setText(''); }}>Done</button>
        </form>
      )}
      <div className="opts">
        {topics.length > 5 && !edit && <button type="button" className="link" onClick={() => setAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${topics.length}`}</button>}
        <span style={{ flex: 1 }} />
        {topics.length > 0 && <button type="button" className="link mute" onClick={() => setEdit(!edit)}>{edit ? 'Done editing' : 'Edit'}</button>}
        {!adding && <button type="button" className="link" onClick={() => setAdding(true)}>+ Add topic</button>}
      </div>
    </div>
  );
}

// Notes: one free-text box, saved when you leave it.
export function NotesCard({ s, save }) {
  const { notes } = H.getHub(s);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(notes);
  const focused = useRef(false);
  const box = useRef(null);
  useEffect(() => { if (!focused.current) setText(notes); }, [notes]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(96, el.scrollHeight + 2)}px`;
  });
  if (!notes && !open) return <Empty onClick={() => setOpen(true)}>+ Add notes</Empty>;
  return (
    <div className="card">
      <h3 className="card-title">Notes</h3>
      <textarea ref={box} className="in notes" placeholder="Notes for this subject" aria-label="Notes" value={text} autoFocus={open && !notes}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; if (text !== notes) save((x) => H.setNotes(x, text)); if (!text.trim()) setOpen(false); }} />
    </div>
  );
}

export function ContactsCard({ s, save, hl }) {
  const { contacts } = H.getHub(s);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState(false);
  const form = adding && (
    <AddForm label="Add contact" onClose={() => setAdding(false)} onAdd={(v) => save((x) => H.addContact(x, v))}
      fields={[{ k: 'name', ph: 'Name', required: true }, { k: 'role', ph: 'Role (coordinator, tutor Thu 2 pm…)' }, { k: 'reach', ph: 'Email or phone', mode: 'email' }]} />
  );
  if (!contacts.length) return adding ? <div className="card"><h3 className="card-title">Key contacts</h3>{form}</div> : <Empty onClick={() => setAdding(true)}>+ Add contact</Empty>;
  return (
    <div className="card">
      <h3 className="card-title">Key contacts</h3>
      <div>
        {contacts.map((c) => {
          if (edit) {
            return (
              <div className="hub-erow contact-e" key={c.id}>
                <Field value={c.name} aria-label="Name" onCommit={(v) => save((x) => H.updateContact(x, c.id, { name: v }))} />
                <Field value={c.role} placeholder="Role" aria-label={`${c.name} role`} onCommit={(v) => save((x) => H.updateContact(x, c.id, { role: v }))} />
                <Field value={c.reach} placeholder="Email or phone" aria-label={`${c.name} email or phone`} onCommit={(v) => save((x) => H.updateContact(x, c.id, { reach: v }))} />
                <button type="button" className="link danger" aria-label={`Remove ${c.name}`} onClick={() => save((x) => H.removeItem(x, 'contact', c.id))}>✕</button>
              </div>
            );
          }
          const r = H.reachLink(c.reach);
          return (
            <div key={c.id} id={`hub-${c.id}`} className={`hrow ${isHl(hl, c.id) ? 'flash' : ''}`}>
              <span className="ico"><Icon name="user" /></span>
              <span className="hrow-t"><span>{c.name}</span><small>{[c.role, c.reach].filter(Boolean).join(' · ')}</small></span>
              {r ? <a className="link" href={r.href}>{r.label}</a> : <span />}
            </div>
          );
        })}
      </div>
      {form}
      <div className="opts">
        <span style={{ flex: 1 }} />
        <button type="button" className="link mute" onClick={() => setEdit(!edit)}>{edit ? 'Done editing' : 'Edit'}</button>
        {!adding && <button type="button" className="link" onClick={() => setAdding(true)}>+ Add contact</button>}
      </div>
    </div>
  );
}
