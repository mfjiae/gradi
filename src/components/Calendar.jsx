// Study calendar: List, Week and Month. Desktop opens on Month, phones on List (each device remembers its choice).
// Tap a task to edit it; tap a day number to add a task on that day. On phones Month shows dots and lists the
// tapped day underneath. Day, 3 days and Year views come later.
import { useState } from 'react';
import { monthWeeks, weekStart, addDays, addMonths, tasksOn, dateLabel, monthLabel, shortDate, timeLabel, isOverdue, isDate, WEEKDAYS, sortTasks } from '../lib/tasks.js';
import { Icon } from './ui.jsx';
import { useIsPhone, useLocalPref } from './hooks.js';
import { TaskRow } from './tasksUi.jsx';

const VIEWS = [['list', 'List'], ['week', 'Week'], ['month', 'Month']];

function Ev({ t, s, now, onOpen }) {
  const cls = t.status === 'done' ? 'dn' : isOverdue(t, now) ? 'od' : '';
  return (
    <button type="button" className={`ev ${cls}`} title={`${s?.code ?? ''} ${t.title}`.trim()} onClick={(e) => { e.stopPropagation(); onOpen(t.uid); }}>
      {t.time && <span className="ev-t">{timeLabel(t.time, true)}</span>}{t.title}
    </button>
  );
}

function DayList({ date, list, by, now, onOpen, onNew, today }) {
  return (
    <section className="tk-group">
      <div className={`gh static ${date < today && list.some((t) => isOverdue(t, now)) ? 'warn' : ''}`}>
        <b>{dateLabel(date)}{date === today ? ' · today' : ''}</b>
        <span className="gh-n">{list.length || '–'}</span>
      </div>
      {list.length > 0 && <div className="tk-list">{list.map((t) => <TaskRow key={t.uid} t={t} s={by.get(t.subjectUid)} now={now} onOpen={onOpen} />)}</div>}
      {onNew && <button type="button" className="link" onClick={() => onNew({ due: date })}>+ Add on {dateLabel(date)}</button>}
    </section>
  );
}

export default function Calendar({ tasks, subjects, now, onOpen, onNew }) {
  const phone = useIsPhone();
  const [desk, setDesk] = useLocalPref('calView', null);
  const [mob, setMob] = useLocalPref('calViewPhone', null);
  const pref = phone ? mob : desk;
  const setPref = phone ? setMob : setDesk;
  const view = pref ?? (phone ? 'list' : 'month');
  const [anchor, setAnchor] = useState(now.date);
  const [sel, setSel] = useState(now.date);
  const by = new Map(subjects.map((s) => [s.uid, s]));
  const today = now.date;

  const step = (n) => setAnchor(view === 'month' ? addMonths(`${anchor.slice(0, 7)}-01`, n) : addDays(anchor, 7 * n));
  const ws = weekStart(anchor);
  const title = view === 'month' ? monthLabel(anchor) : `${shortDate(ws)} – ${shortDate(addDays(ws, 6))}`;

  const head = (
    <div className="cal-head">
      <div className="chips">
        {VIEWS.map(([k, l]) => <button type="button" key={k} className={`chip ${view === k ? 'on' : ''}`} aria-pressed={view === k} onClick={() => setPref(k)}>{l}</button>)}
      </div>
      {view !== 'list' && (
        <div className="cal-nav">
          <button type="button" className="btn sm ghost" aria-label="Previous" onClick={() => step(-1)}><Icon name="back" /></button>
          <b>{title}</b>
          <button type="button" className="btn sm ghost" aria-label="Next" onClick={() => step(1)}><Icon name="next" /></button>
          <button type="button" className="btn sm ghost" onClick={() => { setAnchor(today); setSel(today); }}>Today</button>
        </div>
      )}
    </div>
  );

  if (view === 'list') {
    const todo = tasks.filter((t) => t.status !== 'done' && isDate(t.due));
    const dates = [...new Set(sortTasks(todo, 'due').map((t) => t.due))];
    const undated = tasks.filter((t) => t.status !== 'done' && !isDate(t.due)).length;
    return (
      <div className="stack">
        {head}
        {dates.length ? dates.map((d) => <DayList key={d} date={d} list={tasksOn(todo, d)} by={by} now={now} onOpen={onOpen} today={today} />)
          : <div className="empty">Nothing with a due date. Tap New to add a task.</div>}
        {undated > 0 && <div className="note">{undated} task{undated === 1 ? '' : 's'} with no date yet are in Tasks.</div>}
      </div>
    );
  }

  if (view === 'week') {
    const days = Array.from({ length: 7 }, (_, k) => addDays(ws, k));
    if (phone) {
      return <div className="stack">{head}{days.map((d) => <DayList key={d} date={d} list={tasksOn(tasks, d)} by={by} now={now} onOpen={onOpen} onNew={onNew} today={today} />)}</div>;
    }
    return (
      <div className="stack">
        {head}
        <div className="wk">
          {days.map((d) => (
            <div key={d} className={`wk-day ${d === today ? 'tdy' : ''}`}>
              <button type="button" className="wk-h" aria-label={`Add a task on ${dateLabel(d)}`} onClick={() => onNew({ due: d })}>{dateLabel(d).replace(/ \w+$/, '')}</button>
              {tasksOn(tasks, d).map((t) => <Ev key={t.uid} t={t} s={by.get(t.subjectUid)} now={now} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const month = anchor.slice(0, 7);
  const weeks = monthWeeks(anchor);
  return (
    <div className="stack">
      {head}
      <div className={`cal ${phone ? 'cal-p' : ''}`} role="grid" aria-label={monthLabel(anchor)}>
        {WEEKDAYS.map((w) => <div key={w} className="cal-wd" role="columnheader">{phone ? w[0] : w}</div>)}
        {weeks.flat().map((d) => {
          const list = tasksOn(tasks, d);
          const cls = [d.slice(0, 7) !== month && 'dim', d === today && 'tdy', phone && d === sel && 'sel'].filter(Boolean).join(' ');
          const num = Number(d.slice(8));
          return phone ? (
            <button type="button" key={d} role="gridcell" className={`cal-c ${cls}`} aria-label={`${dateLabel(d)}, ${list.length} task${list.length === 1 ? '' : 's'}`} onClick={() => setSel(d)}>
              <span className="cal-n">{num}</span>
              {list.length > 0 && <span className="dots">{list.slice(0, 3).map((t) => <i key={t.uid} className={t.status === 'done' ? 'dn' : isOverdue(t, now) ? 'od' : ''} />)}</span>}
            </button>
          ) : (
            <div key={d} role="gridcell" className={`cal-c ${cls}`}>
              <button type="button" className="cal-n" aria-label={`Add a task on ${dateLabel(d)}`} onClick={() => onNew({ due: d })}>{num}</button>
              {list.slice(0, 3).map((t) => <Ev key={t.uid} t={t} s={by.get(t.subjectUid)} now={now} onOpen={onOpen} />)}
              {list.length > 3 && <button type="button" className="ev more" onClick={() => { setAnchor(d); setPref('week'); }}>+{list.length - 3} more</button>}
            </div>
          );
        })}
      </div>
      {phone && <DayList date={sel} list={tasksOn(tasks, sel)} by={by} now={now} onOpen={onOpen} onNew={onNew} today={today} />}
    </div>
  );
}
