// Subject hub (M8): pinned links, key contacts, revision topics, notes and exam room / allowed items, kept on the
// subject record as `hub` (so it syncs, backs up and restores with the subject; newest edit wins for the whole
// subject). Older subjects have no `hub`: getHub fills in the empty shape. Pure functions, each returns a NEW
// subject. Tested.
import { sortTasks, isDate, daysBetween, linkTarget } from './tasks.js';

const pid = () => Math.random().toString(36).slice(2, 10);
const str = (v) => String(v ?? '').trim();
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && x.id) : []);

export function getHub(s) {
  const h = s?.hub ?? {};
  return {
    links: arr(h.links),
    contacts: arr(h.contacts),
    topics: arr(h.topics),
    notes: typeof h.notes === 'string' ? h.notes : '',
    exam: { room: str(h.exam?.room), allowed: str(h.exam?.allowed) },
  };
}

const withHub = (s, fn) => {
  const t = structuredClone(s);
  const h = getHub(t);
  fn(h);
  t.hub = h;
  return t;
};

// Addresses: add https:// when left out; only web, mail and phone addresses are kept (never javascript: etc.).
export function cleanUrl(raw) {
  const u = str(raw);
  if (!u) return '';
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^[^:]+:\d/.test(u)) return ''; // another scheme: refuse
  return `https://${u.replace(/^\/+/, '')}`;
}
// Short host for the link chip's tooltip / list ("canvas.uts.edu.au").
export function hostOf(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
}
const linkName = (name, url) => str(name) || hostOf(url) || 'Link';

export function addLink(s, { name, url }) {
  const u = cleanUrl(url);
  if (!u) return s;
  return withHub(s, (h) => { h.links.push({ id: pid(), name: linkName(name, u), url: u }); });
}
export function updateLink(s, id, f) {
  return withHub(s, (h) => {
    const l = h.links.find((x) => x.id === id);
    if (!l) return;
    if (f.url != null) { const u = cleanUrl(f.url); if (u) l.url = u; }
    if (f.name != null) l.name = linkName(f.name, l.url);
  });
}

// Contacts: name, role (coordinator, tutor Thu 2 pm), and one way to reach them (email, phone or anything).
export function addContact(s, { name, role, reach }) {
  if (!str(name)) return s;
  return withHub(s, (h) => { h.contacts.push({ id: pid(), name: str(name), role: str(role), reach: str(reach) }); });
}
export function updateContact(s, id, f) {
  return withHub(s, (h) => {
    const c = h.contacts.find((x) => x.id === id);
    if (!c) return;
    if (f.name != null && str(f.name)) c.name = str(f.name);
    if (f.role != null) c.role = str(f.role);
    if (f.reach != null) c.reach = str(f.reach);
  });
}
// How to reach a contact: an email address → mail link, a phone number → call link, anything else → plain text.
export function reachLink(reach) {
  const r = str(reach);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) return { href: `mailto:${r}`, label: 'Email' };
  if (/^\+?[\d\s()-]{6,}$/.test(r)) return { href: `tel:${r.replace(/[\s()-]/g, '')}`, label: 'Call' };
  return null;
}

export function addTopic(s, name) {
  if (!str(name)) return s;
  return withHub(s, (h) => { h.topics.push({ id: pid(), name: str(name), done: false }); });
}
export function toggleTopic(s, id) {
  return withHub(s, (h) => { const t = h.topics.find((x) => x.id === id); if (t) t.done = !t.done; });
}
export function renameTopic(s, id, name) {
  return withHub(s, (h) => { const t = h.topics.find((x) => x.id === id); if (t && str(name)) t.name = str(name); });
}

const LISTS = { link: 'links', contact: 'contacts', topic: 'topics' };
export function removeItem(s, kind, id) {
  const key = LISTS[kind];
  if (!key) return s;
  return withHub(s, (h) => { h[key] = h[key].filter((x) => x.id !== id); });
}

export const setNotes = (s, text) => withHub(s, (h) => { h.notes = String(text ?? '').replace(/\s+$/, ''); });
export function setExamInfo(s, f) {
  return withHub(s, (h) => {
    if (f.room != null) h.exam.room = str(f.room);
    if (f.allowed != null) h.exam.allowed = str(f.allowed);
  });
}

// The subject's next exam: its open exam task due today or later (an exam by name, or linked to an exam
// assessment), the same rule as the exam countdowns. null if none.
export function nextExam(s, tasks, now) {
  if (!s) return null;
  const list = sortTasks((tasks ?? []).filter((t) => {
    if (t.subjectUid !== s.uid || t.status === 'done' || !isDate(t.due) || t.due < now.date) return false;
    const x = linkTarget(s, t.link);
    return /exam/i.test(t.title) || (x && /exam/i.test(x.c.name));
  }), 'due');
  const t = list[0];
  return t ? { task: t, days: daysBetween(now.date, t.due) } : null;
}
