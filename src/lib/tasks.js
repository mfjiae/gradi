// Study tasks: pure logic (dates, groups, sorting, repeats, countdowns, links to assessments). Tested.
//
// A task = { uid, title, subjectUid, status, important, due, time, repeat, remind, details, link, order, doneAt,
//            createdAt, updatedAt }
//  - status: 'open' | 'progress' | 'done'. Overdue is worked out from the due date, never stored.
//  - due: 'YYYY-MM-DD' (a Sydney calendar date) or null; time: 'HH:MM' (24 h) or null.
//  - repeat: null | 'daily' | 'weekly' | 'fortnightly' | 'monthly'. Ticking a repeating task Done adds the next one.
//  - remind: null or days before the due date (0 = on the day). Reminders show inside the app (Home Due soon).
//  - link: null or { cid, iid }: a part of an assessment in the task's subject. Entering that part's mark ticks
//    the task Done; renaming the part renames a task that still has the part's name; removing it drops the link.
//  - order: manual order (smaller first).
import { isNum, num } from './grades.js';
import { newUid } from './edit.js';

export const STATUSES = ['open', 'progress', 'done'];
export const STATUS_LABEL = { open: 'Open', progress: 'In progress', done: 'Done' };
export const REPEATS = ['daily', 'weekly', 'fortnightly', 'monthly'];
export const REPEAT_LABEL = { daily: 'Every day', weekly: 'Every week', fortnightly: 'Every 2 weeks', monthly: 'Every month' };
export const REMINDS = [0, 1, 2, 7];
export const remindLabel = (n) => (n === 0 ? 'On the day' : n === 7 ? '1 week before' : `${n} day${n === 1 ? '' : 's'} before`);

// ---------- dates (Sydney calendar dates as 'YYYY-MM-DD') ----------
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function sydneyNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

const toUTC = (date) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => { const x = new Date(ms); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
export const addDays = (date, n) => fromUTC(toUTC(date) + n * DAY);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}
export const weekday = (date) => (new Date(toUTC(date)).getUTCDay() + 6) % 7; // Monday = 0
export const weekStart = (date) => addDays(date, -weekday(date));
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function dateLabel(date, { year = false } = {}) {
  const [y, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[weekday(date)]} ${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
}
export const monthLabel = (date) => { const [y, m] = date.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; };
export const shortDate = (date) => { const [, m, d] = date.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };
export function timeLabel(t, short = false) {
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? (short ? 'am' : 'AM') : (short ? 'pm' : 'PM');
  if (short) return `${h % 12 || 12}${m ? `:${pad(m)}` : ''}${ap}`;
  return `${h % 12 || 12}:${pad(m)} ${ap}`;
}
export const dueText = (t) => (isDate(t.due) ? `${dateLabel(t.due)}${t.time ? `, ${timeLabel(t.time)}` : ''}` : '');

// Weeks (Monday first) covering the month of `date`; each week is 7 dates.
export function monthWeeks(date) {
  const first = `${date.slice(0, 7)}-01`;
  const next = addMonths(first, 1);
  const weeks = [];
  for (let start = weekStart(first); start < next; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, k) => addDays(start, k)));
  }
  return weeks;
}

// ---------- states ----------
const dueKey = (t) => `${t.due}T${t.time || '23:59'}`;
export const isOverdue = (t, now) => t.status !== 'done' && isDate(t.due) && dueKey(t) < `${now.date}T${now.time}`;

export function relText(t, now) {
  if (t.status === 'done') return 'Done';
  if (!isDate(t.due)) return 'No date yet';
  const n = daysBetween(now.date, t.due);
  if (isOverdue(t, now)) return n >= 0 ? 'Overdue' : `${-n} day${n === -1 ? '' : 's'} overdue`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n} days`;
}

// ---------- making and changing tasks ----------
const cleanLink = (l) => (l && typeof l.cid === 'string' && l.cid ? { cid: l.cid, iid: typeof l.iid === 'string' ? l.iid : null } : null);
const cleanRemind = (v) => { const n = num(v); return n == null || n < 0 ? null : Math.round(n); };

export function newTask(f = {}, nowMs = Date.now()) {
  const status = STATUSES.includes(f.status) ? f.status : 'open';
  const due = isDate(f.due) ? f.due : null;
  return {
    uid: newUid(),
    title: String(f.title ?? '').trim(),
    subjectUid: typeof f.subjectUid === 'string' ? f.subjectUid : null,
    status,
    important: !!f.important,
    due,
    time: due && isTime(f.time) ? f.time : null,
    repeat: due && REPEATS.includes(f.repeat) ? f.repeat : null,
    remind: due ? cleanRemind(f.remind) : null,
    details: String(f.details ?? ''),
    link: cleanLink(f.link),
    order: num(f.order) ?? nowMs,
    doneAt: status === 'done' ? nowMs : null,
    createdAt: nowMs,
  };
}

// Apply the pop-up's fields to a saved task (keeps uid, order and createdAt).
export function setTaskFields(t, f, nowMs = Date.now()) {
  const n = newTask({ ...t, ...f }, nowMs);
  const doneAt = n.status === 'done' ? (t.status === 'done' ? t.doneAt ?? nowMs : nowMs) : null;
  return { ...t, ...n, uid: t.uid, order: t.order ?? n.order, createdAt: t.createdAt ?? nowMs, doneAt };
}

export function nextDue(date, repeat) {
  if (repeat === 'daily') return addDays(date, 1);
  if (repeat === 'weekly') return addDays(date, 7);
  if (repeat === 'fortnightly') return addDays(date, 14);
  if (repeat === 'monthly') return addMonths(date, 1);
  return null;
}

// Tick a task Done. A repeating task also gives the next one (open, next date, not linked to an assessment).
export function completeTask(t, nowMs = Date.now()) {
  const task = { ...t, status: 'done', doneAt: nowMs };
  let next = null;
  if (t.status !== 'done' && t.repeat && isDate(t.due)) {
    next = { ...t, uid: newUid(), status: 'open', doneAt: null, due: nextDue(t.due, t.repeat), link: null, createdAt: nowMs, order: nowMs };
    delete next.updatedAt;
  }
  return { task, next };
}

// ---------- links to assessments ----------
export function linkTarget(s, link) {
  if (!s || !link) return null;
  const c = s.components?.find((x) => x.id === link.cid);
  if (!c) return null;
  const i = c.single ? c.items?.[0] : c.items?.find((x) => x.id === link.iid);
  return i ? { c, i } : null;
}
export const partTitle = (c, i) => (c.single ? c.name : i.name);
export function linkLabel(s, link) {
  const x = linkTarget(s, link);
  return x ? (x.c.single ? x.c.name : `${x.c.name} › ${x.i.name}`) : null;
}
// Everything a task can link to in a subject: one entry per single-mark assessment, one per part otherwise.
export function linkOptions(s) {
  return (s?.components ?? []).map((c) => ({
    name: c.name,
    parts: c.single
      ? (c.items[0] ? [{ cid: c.id, iid: c.items[0].id, label: c.name, title: c.name }] : [])
      : c.items.map((i) => ({ cid: c.id, iid: i.id, label: i.name, title: i.name })),
  })).filter((g) => g.parts.length);
}
// Parts that are in `next` but not in `prev` (for the due-date prompt after adding an assessment or a part).
export function newParts(prev, next) {
  const had = new Set((prev?.components ?? []).flatMap((c) => c.items.map((i) => `${c.id}/${i.id}`)));
  const hadComp = new Set((prev?.components ?? []).map((c) => c.id));
  const out = [];
  for (const c of next?.components ?? []) {
    if (c.single) {
      if (!hadComp.has(c.id) && c.items[0]) out.push({ cid: c.id, iid: c.items[0].id, title: c.name, comp: c.name });
    } else {
      for (const i of c.items) if (!had.has(`${c.id}/${i.id}`)) out.push({ cid: c.id, iid: i.id, title: i.name, comp: c.name });
    }
  }
  return out;
}

// After a subject is saved: what happens to the tasks linked to it.
// Returns { updates: tasks to save, adds: next copies of repeating tasks that were ticked Done }.
export function linkedTaskChanges(oldS, newS, tasks, nowMs = Date.now()) {
  const updates = [];
  const adds = [];
  for (const t of tasks) {
    if (t.subjectUid !== newS.uid || !t.link) continue;
    const nw = linkTarget(newS, t.link);
    if (!nw) { updates.push({ ...t, link: null }); continue; }
    const od = linkTarget(oldS, t.link);
    let u = t;
    if (od) {
      const was = partTitle(od.c, od.i);
      const now = partTitle(nw.c, nw.i);
      if (t.title === was && now !== was && now.trim()) u = { ...u, title: now };
    }
    const wasMarked = od ? isNum(od.i.score) : true;
    if (!wasMarked && isNum(nw.i.score) && u.status !== 'done') {
      const r = completeTask(u, nowMs);
      u = r.task;
      if (r.next) adds.push(r.next);
    }
    if (u !== t) updates.push(u);
  }
  return { updates, adds };
}

// ---------- lists ----------
const dueCmp = (a, b) => {
  const ka = isDate(a.due) ? dueKey(a) : '9999';
  const kb = isDate(b.due) ? dueKey(b) : '9999';
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};
const orderCmp = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export const SORTS = { due: 'Due date', manual: 'Manual order', important: 'Important first', title: 'Name' };
export function sortTasks(list, key = 'due') {
  const cmp = {
    due: (a, b) => dueCmp(a, b) || (b.important - a.important) || orderCmp(a, b),
    manual: (a, b) => orderCmp(a, b) || dueCmp(a, b),
    important: (a, b) => (b.important - a.important) || dueCmp(a, b) || orderCmp(a, b),
    title: (a, b) => a.title.localeCompare(b.title) || dueCmp(a, b),
  }[key] ?? ((a, b) => dueCmp(a, b));
  return [...list].sort(cmp);
}
const doneSort = (list, key) => (key === 'manual' ? sortTasks(list, 'manual') : [...list].sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)));

export const GROUPS = { status: 'Status', due: 'Due date', subject: 'Subject', none: 'None' };
export function filterTasks(tasks, { subject = '', important = false } = {}) {
  return tasks.filter((t) => (!subject || t.subjectUid === subject) && (!important || t.important));
}

// Groups for the Tasks view. Done is always last (shown collapsed by the page).
export function groupTasks(tasks, { group = 'status', sort = 'due', now, subjects = [] } = {}) {
  const done = tasks.filter((t) => t.status === 'done');
  const todo = tasks.filter((t) => t.status !== 'done');
  const od = todo.filter((t) => isOverdue(t, now));
  const live = todo.filter((t) => !isOverdue(t, now));
  const g = (id, label, items, tone) => ({ id, label, items: sortTasks(items, sort), tone });
  let out;
  if (group === 'due') {
    const n = (t) => daysBetween(now.date, t.due);
    out = [
      g('overdue', 'Overdue', od, 'warn'),
      g('today', 'Today', live.filter((t) => isDate(t.due) && n(t) <= 0)),
      g('week', 'This week', live.filter((t) => isDate(t.due) && n(t) >= 1 && n(t) <= 7)),
      g('later', 'Later', live.filter((t) => isDate(t.due) && n(t) > 7)),
      g('nodate', 'No date yet', live.filter((t) => !isDate(t.due))),
    ];
  } else if (group === 'subject') {
    const known = new Set(subjects.map((s) => s.uid));
    out = [...subjects].sort((a, b) => a.code.localeCompare(b.code))
      .map((s) => g(`s-${s.uid}`, s.code, todo.filter((t) => t.subjectUid === s.uid)))
      .concat([g('nosub', 'No subject', todo.filter((t) => !known.has(t.subjectUid)))]);
  } else if (group === 'none') {
    out = [g('todo', 'To do', todo)];
  } else {
    out = [
      g('overdue', 'Overdue', od, 'warn'),
      g('open', 'Open', live.filter((t) => t.status === 'open')),
      g('progress', 'In progress', live.filter((t) => t.status === 'progress')),
    ];
  }
  out = out.filter((x) => x.items.length);
  if (done.length) out.push({ id: 'done', label: 'Done', items: doneSort(done, sort), collapsible: true });
  return out;
}

// Home "Due soon": overdue, due in the next `days` days, or inside its reminder window. Plus the undated count.
export function dueSoon(tasks, now, days = 7) {
  const todo = tasks.filter((t) => t.status !== 'done');
  const soon = todo.filter((t) => {
    if (!isDate(t.due)) return false;
    const n = daysBetween(now.date, t.due);
    return isOverdue(t, now) || n <= days || (t.remind != null && n <= t.remind);
  });
  return { items: sortTasks(soon, 'due'), undated: todo.filter((t) => !isDate(t.due)).length };
}
export const remindingNow = (t, now) => t.remind != null && isDate(t.due) && t.status !== 'done' && daysBetween(now.date, t.due) <= t.remind;

// Exam countdowns: open tasks due today or later that are exams (by name, or linked to an exam).
export function countdowns(tasks, subjects, now) {
  const by = new Map(subjects.map((s) => [s.uid, s]));
  return sortTasks(tasks.filter((t) => {
    if (t.status === 'done' || !isDate(t.due) || t.due < now.date) return false;
    const x = linkTarget(by.get(t.subjectUid), t.link);
    return /exam/i.test(t.title) || (x && /exam/i.test(x.c.name));
  }), 'due').map((t) => ({ uid: t.uid, days: daysBetween(now.date, t.due), code: by.get(t.subjectUid)?.code ?? '', title: t.title, due: t.due }));
}
export const daysText = (n) => (n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`);

// Tasks on a given date (calendar), sorted by time.
export const tasksOn = (tasks, date) => sortTasks(tasks.filter((t) => t.due === date), 'due');
