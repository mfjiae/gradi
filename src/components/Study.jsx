// Study tab: exam countdowns, then Tasks (grouped by status, sorted by due date by default; Sort, Group and Filter
// on the bar; drag ⋮⋮ in Manual order) or the Calendar (Month on desktop, List on phones; Week too).
import { useRef, useState } from 'react';
import { groupTasks, filterTasks, SORTS, GROUPS } from '../lib/tasks.js';
import { isCurrent } from '../lib/grades.js';
import * as store from '../lib/store.js';
import { Icon } from './ui.jsx';
import { useLocalPref, useNow } from './hooks.js';
import { TaskRow, Countdowns } from './tasksUi.jsx';
import Calendar from './Calendar.jsx';
import ImportTasks from './ImportTasks.jsx';

// A group of tasks. In manual order each row has a ⋮⋮ handle: drag it (mouse or finger), or focus it and use the
// arrow keys.
function TaskGroup({ g, by, now, onOpen, manual, open, setOpen }) {
  const [drag, setDrag] = useState(null); // { uid, list, active }
  const box = useRef(null);
  const items = drag ? drag.list.map((uid) => g.items.find((t) => t.uid === uid)).filter(Boolean) : g.items;
  const canDrag = manual && g.items.length > 1;

  const move = (e) => {
    if (!drag?.active) return;
    // Near the top or bottom of the screen, scroll so a task can be dragged past what's visible.
    if (e.clientY < 70) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 110) window.scrollBy(0, 12);
    const rows =[...box.current.querySelectorAll('.tk[data-uid]')].filter((r) => r.dataset.uid !== drag.uid);
    const idx = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < e.clientY; }).length;
    const rest = drag.list.filter((u) => u !== drag.uid);
    const list = [...rest.slice(0, idx), drag.uid, ...rest.slice(idx)];
    if (list.join() !== drag.list.join()) setDrag({ ...drag, list });
  };
  const end = async () => {
    if (!drag?.active) return;
    const list = drag.list;
    setDrag({ ...drag, active: false });
    if (list.join() !== g.items.map((t) => t.uid).join()) await store.reorderTasks(list);
    setDrag(null);
  };
  const key = async (e, uid) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const list = g.items.map((t) => t.uid);
    const k = list.indexOf(uid);
    const j = e.key === 'ArrowUp' ? k - 1 : k + 1;
    if (j < 0 || j >= list.length) return;
    [list[k], list[j]] = [list[j], list[k]];
    await store.reorderTasks(list);
    requestAnimationFrame(() => box.current?.querySelector(`.tk[data-uid="${uid}"] .grip`)?.focus());
  };
  const grip = (t) => (canDrag ? (
    <button type="button" className={`grip ${drag?.uid === t.uid ? 'on' : ''}`} aria-label={`Move ${t.title} (arrow keys)`}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag({ uid: t.uid, list: g.items.map((x) => x.uid), active: true }); }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={(e) => key(e, t.uid)}>
      <Icon name="grip" />
    </button>
  ) : null);

  const shut = g.collapsible && !open;
  return (
    <section className="tk-group">
      <button type="button" className={`gh ${g.tone ?? ''}`} aria-expanded={!shut} disabled={!g.collapsible} onClick={() => g.collapsible && setOpen(!open)}>
        <span className="gh-car">{shut ? '▸' : '▾'}</span><b>{g.label}</b><span className="gh-n">{g.items.length}</span>
      </button>
      {!shut && (
        <div className="tk-list" ref={box}>
          {items.map((t) => <TaskRow key={t.uid} t={t} s={by.get(t.subjectUid)} now={now} onOpen={onOpen} grip={grip(t)} />)}
        </div>
      )}
    </section>
  );
}

function Tasks({ tasks, subjects, current, now, onOpen, onNew }) {
  const [sort, setSort] = useLocalPref('taskSort', 'due');
  const [group, setGroup] = useLocalPref('taskGroup', 'status');
  const [flt, setFlt] = useLocalPref('taskFilter', { subject: '', important: false });
  const [doneOpen, setDoneOpen] = useLocalPref('doneOpen', false);
  const [panel, setPanel] = useState(null);
  const by = new Map(subjects.map((s) => [s.uid, s]));
  const filter = { subject: by.has(flt?.subject) ? flt.subject : '', important: !!flt?.important };
  const shown = filterTasks(tasks, filter);
  const groups = groupTasks(shown, { group, sort, now, subjects });
  const withTasks = new Set(tasks.map((t) => t.subjectUid));
  const filterSubs = subjects.filter((s) => withTasks.has(s.uid) || isCurrent(s, current)).sort((a, b) => a.code.localeCompare(b.code));
  const nFilters = (filter.subject ? 1 : 0) + (filter.important ? 1 : 0);
  const bar = (id, label, value) => (
    <button type="button" className={`tb ${panel === id ? 'on' : ''}`} aria-expanded={panel === id} onClick={() => setPanel(panel === id ? null : id)}>
      {label}{value ? <span className="tb-v">: {value}</span> : null}
    </button>
  );
  return (
    <>
      <div className="bar">
        {bar('sort', 'Sort', SORTS[sort])}
        {bar('group', 'Group', GROUPS[group])}
        {bar('filter', 'Filter', nFilters ? String(nFilters) : '')}
      </div>
      {panel === 'sort' && <div className="chips">{Object.entries(SORTS).map(([k, l]) => <button type="button" key={k} className={`chip ${sort === k ? 'on' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>)}</div>}
      {panel === 'group' && <div className="chips">{Object.entries(GROUPS).map(([k, l]) => <button type="button" key={k} className={`chip ${group === k ? 'on' : ''}`} aria-pressed={group === k} onClick={() => setGroup(k)}>{l}</button>)}</div>}
      {panel === 'filter' && (
        <div className="chips">
          <button type="button" className={`chip ${!filter.subject ? 'on' : ''}`} aria-pressed={!filter.subject} onClick={() => setFlt({ ...filter, subject: '' })}>All subjects</button>
          {filterSubs.map((s) => <button type="button" key={s.uid} className={`chip ${filter.subject === s.uid ? 'on' : ''}`} aria-pressed={filter.subject === s.uid} onClick={() => setFlt({ ...filter, subject: s.uid })}>{s.code}</button>)}
          <button type="button" className={`chip ${filter.important ? 'on' : ''}`} aria-pressed={filter.important} onClick={() => setFlt({ ...filter, important: !filter.important })}>★ Important only</button>
        </div>
      )}
      {sort === 'manual' && <div className="note">Drag ⋮⋮ to put tasks in your own order.</div>}
      {!tasks.length ? (
        <div className="empty">
          {subjects.length ? 'No tasks yet. Tap New or Import, or add an assessment in a subject’s Marks.' : 'Add a subject first. Every task belongs to one.'}
          {subjects.length > 0 && <div><button type="button" className="btn sm primary" style={{ marginTop: 12 }} onClick={() => onNew()}><Icon name="plus" />New task</button></div>}
        </div>
      ) : !groups.length ? <div className="empty">No tasks match the filter.</div> : (
        <div className="stack">
          {groups.map((g) => (
            <TaskGroup key={g.id} g={g} by={by} now={now} onOpen={onOpen} manual={sort === 'manual'}
              open={g.id === 'done' ? doneOpen : true} setOpen={setDoneOpen} />
          ))}
        </div>
      )}
    </>
  );
}

export default function Study({ tasks, subjects, current, onOpen, onNew }) {
  const now = useNow();
  const [view, setView] = useLocalPref('studyView', 'tasks');
  const [importing, setImporting] = useState(false);
  return (
    <>
      <div className="head">
        <h1 className="h1">Study</h1>
        <div className="chips">
          <button type="button" className={`chip ${view !== 'calendar' ? 'on' : ''}`} aria-pressed={view !== 'calendar'} onClick={() => setView('tasks')}>Tasks</button>
          <button type="button" className={`chip ${view === 'calendar' ? 'on' : ''}`} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
          <span className="chips-sep" aria-hidden="true" />
          <button type="button" className="btn sm primary" disabled={!subjects.length} onClick={() => setImporting(true)}>Import</button>
          <button type="button" className="btn sm primary" disabled={!subjects.length} onClick={() => onNew()}><Icon name="plus" />New</button>
        </div>
      </div>
      {importing && <ImportTasks tasks={tasks} subjects={subjects} current={current} onClose={() => setImporting(false)} />}
      <Countdowns tasks={tasks} subjects={subjects} now={now} onOpen={onOpen} />
      <div className="card">
        {view === 'calendar'
          ? <Calendar tasks={tasks} subjects={subjects} now={now} onOpen={onOpen} onNew={onNew} />
          : <Tasks tasks={tasks} subjects={subjects} current={current} now={now} onOpen={onOpen} onNew={onNew} />}
      </div>
    </>
  );
}
