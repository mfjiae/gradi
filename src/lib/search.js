// Quick search (M8, Ctrl+K): one list of everything you can jump to (subjects, tasks, hub links, contacts,
// revision topics, exam info), and the matching. Pure, tested (__tests__/search.test.js).
import { sessionName, sessionKey } from './grades.js';
import { isFuture } from './plan.js';
import { dueText, dueSoon, STATUS_LABEL } from './tasks.js';
import { getHub, hostOf } from './hub.js';

export const KINDS = ['subject', 'task', 'exam', 'link', 'contact', 'topic'];
export const KIND_LABEL = { subject: 'Subjects', task: 'Tasks', exam: 'Exams', link: 'Links', contact: 'Contacts', topic: 'Revision topics' };
const PER_GROUP = 8;

// Every searchable thing. Each: { kind, id, title, sub, subjectUid, url?, hay } (hay = lowercase text to match).
export function buildIndex({ subjects = [], tasks = [], current }) {
  const out = [];
  const by = new Map(subjects.map((s) => [s.uid, s]));
  const label = (s) => [s.code, s.name].filter(Boolean).join(' ');
  for (const s of subjects) {
    const when = current && isFuture(s, current) ? `${sessionName(s)} · planned` : sessionName(s);
    out.push({ kind: 'subject', id: s.uid, title: label(s), sub: when, subjectUid: s.uid, hay: `${s.code} ${s.name ?? ''}` });
    const h = getHub(s);
    for (const l of h.links) out.push({ kind: 'link', id: l.id, title: l.name, sub: `${s.code} · ${hostOf(l.url)}`, subjectUid: s.uid, url: l.url, hay: `${l.name} ${l.url} ${s.code}` });
    for (const c of h.contacts) out.push({ kind: 'contact', id: c.id, title: c.name, sub: [s.code, c.role].filter(Boolean).join(' · '), subjectUid: s.uid, hay: `${c.name} ${c.role} ${c.reach} ${s.code}` });
    for (const t of h.topics) out.push({ kind: 'topic', id: t.id, title: t.name, sub: `${s.code} · ${t.done ? 'done' : 'not done'}`, subjectUid: s.uid, hay: `${t.name} ${s.code}` });
    if (h.exam.room || h.exam.allowed) {
      out.push({ kind: 'exam', id: `exam-${s.uid}`, title: `Exam · ${s.code}`, sub: [h.exam.room && `Room ${h.exam.room}`, h.exam.allowed].filter(Boolean).join(' · '), subjectUid: s.uid, hay: `exam room ${h.exam.room} ${h.exam.allowed} ${s.code} ${s.name ?? ''}` });
    }
  }
  for (const t of tasks) {
    const s = by.get(t.subjectUid);
    const bits = [s?.code, t.status === 'done' ? STATUS_LABEL.done : dueText(t) && `due ${dueText(t)}`].filter(Boolean);
    out.push({ kind: 'task', id: t.uid, title: t.title, sub: bits.join(' · '), subjectUid: t.subjectUid, done: t.status === 'done', hay: `${t.title} ${s?.code ?? ''} ${t.details ?? ''}` });
  }
  for (const x of out) x.hay = x.hay.toLowerCase();
  return out;
}

// Every word typed must appear somewhere. Best first: title starts with the query, then a word in the title
// starts with it, then the title contains it, then only the other text matches. Open tasks before done ones.
function score(x, q) {
  const t = x.title.toLowerCase();
  let s = t.startsWith(q) ? 0 : new RegExp(`(^|[\\s·(-])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t) ? 1 : t.includes(q) ? 2 : 3;
  if (x.done) s += 4;
  return s;
}

// Results grouped by kind (in KINDS order), at most 8 per group. Empty query: this session's subjects and what's
// due soon. Returns [{ kind, label, items }].
export function search(index, query, { subjects = [], tasks = [], current, now } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) {
    const cur = current ? sessionKey(current) : null;
    const subs = index.filter((x) => x.kind === 'subject' && subjects.some((s) => s.uid === x.id && sessionKey(s) === cur));
    const soon = now ? new Set(dueSoon(tasks, now).items.slice(0, 5).map((t) => t.uid)) : new Set();
    const due = index.filter((x) => x.kind === 'task' && soon.has(x.id)).sort((a, b) => [...soon].indexOf(a.id) - [...soon].indexOf(b.id));
    return [
      subs.length && { kind: 'subject', label: 'This session', items: subs },
      due.length && { kind: 'task', label: 'Due soon', items: due },
    ].filter(Boolean);
  }
  const words = q.split(/\s+/);
  const hits = index.filter((x) => words.every((w) => x.hay.includes(w)));
  return KINDS.map((k) => {
    const items = hits.filter((x) => x.kind === k)
      .map((x) => [score(x, q), x])
      .sort((a, b) => a[0] - b[0] || a[1].title.localeCompare(b[1].title))
      .slice(0, PER_GROUP).map(([, x]) => x);
    return items.length ? { kind: k, label: KIND_LABEL[k], items } : null;
  }).filter(Boolean);
}

export const flat = (groups) => groups.flatMap((g) => g.items);
