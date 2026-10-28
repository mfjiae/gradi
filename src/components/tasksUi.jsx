// Shared pieces for study tasks: a task row, the exam countdown boxes and Home's Due soon card.
import { isOverdue, relText, dueText, dueSoon, countdowns, daysText, dateLabel, remindingNow } from '../lib/tasks.js';
import * as store from '../lib/store.js';
import { Icon } from './ui.jsx';

const toggleDone = (t) => store.setTaskStatus(t.uid, t.status === 'done' ? 'open' : 'done');

// One task: status dot (tap to tick Done or reopen), name and due line (tap to edit), then linked, subject,
// important and reminder marks. `grip` is the drag handle in manual order.
export function TaskRow({ t, s, now, onOpen, grip = null }) {
  const od = isOverdue(t, now);
  const done = t.status === 'done';
  const dot = done ? 'dn' : od ? 'od' : t.status === 'progress' ? 'ip' : '';
  const ring = !done && remindingNow(t, now);
  return (
    <div className={`tk ${grip ? 'has-grip' : ''} ${done ? 'done' : ''}`} data-uid={t.uid}>
      {grip}
      <button type="button" className={`tk-dot ${dot}`} aria-label={done ? `Reopen ${t.title}` : `Tick ${t.title} done`} onClick={() => toggleDone(t)}>
        {done && <Icon name="check" />}
      </button>
      <button type="button" className="tk-main" onClick={() => onOpen(t.uid)}>
        <b>{t.title || 'Untitled task'}</b>
        <span>
          {t.due ? `due ${dueText(t)} · ` : ''}
          <span className={od ? 'od' : ''}>{relText(t, now)}</span>
          {t.status === 'progress' && !od ? ' · in progress' : ''}
          {t.repeat ? ' · repeats' : ''}
        </span>
      </button>
      <span className="tk-ico">
        {t.link && <span className="pill lk">linked</span>}
        {s && <span className="pill sub">{s.code}</span>}
        {t.important && <span className="tk-star" aria-label="Important" role="img"><Icon name="star" /></span>}
        {t.remind != null && !done && <span className={`tk-bell ${ring ? 'on' : ''}`} aria-label="Has a reminder" role="img"><Icon name="bell" /></span>}
      </span>
    </div>
  );
}

export function Countdowns({ tasks, subjects, now, onOpen, max = 4 }) {
  const list = countdowns(tasks, subjects, now).slice(0, max);
  if (!list.length) return null;
  return (
    <div className="cd">
      {list.map((x) => (
        <button type="button" key={x.uid} className="cdb" onClick={() => onOpen(x.uid)}>
          <b>{daysText(x.days)}</b>
          <span>{x.code} {x.title} · {dateLabel(x.due)}</span>
        </button>
      ))}
    </div>
  );
}

// Home: exam countdowns, then what's overdue, due in the next 7 days, or reminding you now.
export function DueSoonCard({ tasks, subjects, now, onOpen, go, max = 6 }) {
  const by = new Map(subjects.map((s) => [s.uid, s]));
  const { items, undated } = dueSoon(tasks, now);
  const more = items.length - max;
  const extra = [more > 0 && `${more} more`, undated > 0 && `${undated} with no date yet`].filter(Boolean).join(' · ');
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title" style={{ '--head': 'var(--warn)' }}>Due soon</h3>
        <span className="note">next 7 days</span>
      </div>
      <Countdowns tasks={tasks} subjects={subjects} now={now} onOpen={onOpen} />
      {items.length ? (
        <div className="tk-list">{items.slice(0, max).map((t) => <TaskRow key={t.uid} t={t} s={by.get(t.subjectUid)} now={now} onOpen={onOpen} />)}</div>
      ) : <div className="note">{tasks.length ? 'Nothing due in the next 7 days.' : 'No tasks yet. Add them in Study.'}</div>}
      <div className="card-head">
        <span className="note">{extra}</span>
        <button type="button" className="link" onClick={() => go('study')}>Open Study</button>
      </div>
    </div>
  );
}
