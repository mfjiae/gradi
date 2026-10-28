// Pure edits to a subject record. Each returns a NEW subject (the old one is untouched); store.js saves it and
// stamps updatedAt. Tested.
import { num, DEFAULT_CP, DEFAULT_TARGET, SESSIONS, OFFICIAL_GRADES } from './grades.js';

export function newUid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
const pid = () => Math.random().toString(36).slice(2, 10); // ids for components and parts (unique within a subject)

const part = (name, max, score = null) => ({ id: pid(), name, score, max, w: null });
const clone = (s) => structuredClone(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function newSubject({ code, name = '', year, session, cp, target } = {}) {
  return {
    uid: newUid(),
    code: String(code ?? '').trim() || 'NEW_SUBJECT',
    name: String(name ?? '').trim(),
    year: num(year) ?? new Date().getFullYear(),
    session: SESSIONS.includes(session) ? session : 'Autumn',
    cp: num(cp) ?? DEFAULT_CP,
    target: clamp(num(target) ?? DEFAULT_TARGET, 0, 100),
    components: [],
    official: null,
    countsGpa: true,
    countsWam: true,
  };
}

// Subject details from the Add / Edit form. official: { grade: '' | 'HD'.. | 'PASS', mark }.
export function setDetails(s, f) {
  const t = clone(s);
  if (f.code != null) t.code = String(f.code).trim() || t.code;
  if (f.name != null) t.name = String(f.name).trim();
  if (f.year != null) t.year = num(f.year) ?? t.year;
  if (f.session != null && SESSIONS.includes(f.session)) t.session = f.session;
  if (f.cp != null) t.cp = num(f.cp) ?? t.cp;
  if (f.target != null) t.target = clamp(num(f.target) ?? t.target, 0, 100);
  if (f.official !== undefined) {
    const g = f.official?.grade;
    if (!g || !OFFICIAL_GRADES.includes(g)) t.official = null;
    else t.official = { grade: g, mark: g === 'PASS' ? null : num(f.official.mark) };
  }
  return t;
}

export const setTarget = (s, v) => ({ ...clone(s), target: clamp(num(v) ?? s.target, 0, 100) });
export const toggleCount = (s, key) => ({ ...clone(s), [key]: s[key] === false });

const withComp = (s, cid, fn) => {
  const t = clone(s);
  const c = t.components.find((x) => x.id === cid);
  if (c) fn(c, t);
  return t;
};

export function setCompField(s, cid, field, value) {
  return withComp(s, cid, (c) => {
    if (field === 'name') c.name = String(value);
    else if (field === 'weight') c.weight = num(value) ?? 0;
    else if (field === 'hurdle') { const h = num(value); c.hurdle = h == null ? null : clamp(h, 0, 100); }
  });
}

export function setPartField(s, cid, iid, field, value) {
  return withComp(s, cid, (c) => {
    const i = c.items.find((x) => x.id === iid);
    if (!i) return;
    if (field === 'name') i.name = String(value);
    else if (field === 'score' || field === 'max') i[field] = num(value);
  });
}

// Quick-add buttons: Assignment, Quizzes, Labs, Exam. New weight = what's left of 100 (or 10 if already full).
export function addComponent(s, kind) {
  const t = clone(s);
  const used = t.components.reduce((a, c) => a + (num(c.weight) || 0), 0);
  const weight = used < 100 ? Math.round((100 - used) * 100) / 100 : 10;
  const prefix = { assignment: 'assi', exam: 'final', quizzes: 'quiz', labs: 'labs' }[kind] || 'assi';
  const n = t.components.filter((c) => c.name.toLowerCase().startsWith(prefix)).length;
  const base = { id: pid(), weight, hurdle: null };
  if (kind === 'exam') t.components.push({ ...base, name: n ? `Exam ${n + 1}` : 'Final exam', single: true, items: [part('Mark', 100)] });
  else if (kind === 'quizzes') t.components.push({ ...base, name: n ? `Quizzes ${n + 1}` : 'Quizzes', single: false, items: [1, 2, 3].map((k) => part(`Quiz ${k}`, 10)) });
  else if (kind === 'labs') t.components.push({ ...base, name: n ? `Labs ${n + 1}` : 'Labs', single: false, items: [1, 2, 3, 4].map((k) => part(`Lab ${k}`, 10)) });
  else t.components.push({ ...base, name: `Assignment ${n + 1}`, single: true, items: [part('Mark', 100)] });
  return t;
}

export function removeComponent(s, cid) {
  const t = clone(s);
  t.components = t.components.filter((c) => c.id !== cid);
  return t;
}

// Single mark <-> split into parts. Splitting keeps the existing mark as Part 1 and adds Part 2.
// Making it single keeps only the first part's mark (the rest stay stored but are not used).
export function toggleSingle(s, cid) {
  return withComp(s, cid, (c) => {
    if (c.single) {
      c.single = false;
      if (c.items[0] && (c.items[0].name === 'Mark' || !c.items[0].name)) c.items[0].name = 'Part 1';
      if (c.items.length < 2) c.items.push(part('Part 2', c.items[0]?.max ?? 100));
    } else {
      c.single = true;
    }
  });
}

export function addPart(s, cid) {
  return withComp(s, cid, (c) => {
    const last = c.items[c.items.length - 1];
    const m = last?.name?.match(/^(.*?)(\d+)$/);
    const name = m ? `${m[1]}${Number(m[2]) + 1}` : `Part ${c.items.length + 1}`;
    c.items.push(part(name, last?.max ?? 10));
  });
}

export function removePart(s, cid, iid) {
  return withComp(s, cid, (c) => { if (c.items.length > 1) c.items = c.items.filter((i) => i.id !== iid); });
}
