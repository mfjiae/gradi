// Import study tasks from text (Study → Import). Pure functions, tested in __tests__/importTasks.test.js.
//
// One task per line (blank lines and lines starting with # are ignored):
//   SUBJECT | task name | date time | link part | note … | important | repeat weekly | remind 2 days
// Only the subject code and the task name are needed; the rest is optional, in any order.
//  - Dates: 3 Nov, Tue 3 Nov, 3 Nov 2026, 3/11, 2026-11-03; time 23:00, 9:30, 11:00 PM, 11pm.
//    A date with no year takes the current year, or next year if that is more than 60 days ago.
//  - link: a part name (Lab 4), an assessment with a single mark (Final exam), or "Labs › Lab 4".
//  - Same subject + same task name (any case) = update that task: only what the line gives changes.
//    A task already Done is left alone. Nothing is ever deleted.
import { newTask, isDate, isTime, daysBetween, addDays, linkOptions, linkTarget, linkLabel, REPEATS, REMINDS, setTaskFields } from './tasks.js';
import { isCurrent, isNum, SESSIONS } from './grades.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const squash = (s) => String(s ?? '').toLowerCase().replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim();
const codeKey = (c) => String(c ?? '').replace(/\s+/g, '').toUpperCase();

const TIME = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';
const RE = {
  iso: new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[ T,]+${TIME})?$`, 'i'),
  named: new RegExp(`^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?(\\d{1,2})\\s+([a-z]{3,9})\\.?(?:\\s+(\\d{4}))?(?:,?\\s+${TIME})?$`, 'i'),
  slash: new RegExp(`^(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}))?(?:,?\\s+${TIME})?$`, 'i'),
  link: /^link\s+(.+)$/i,
  note: /^(?:note|details?)\s+(.+)$/i,
  important: /^(important|★)$/i,
  repeat: /^repeat\s+(daily|weekly|fortnightly|monthly|every day|every week|every 2 weeks|every month)$/i,
  remind: /^remind\s+(?:(on the day|same day)|(\d+)\s*days?(?:\s+before)?|1\s*week(?:\s+before)?)$/i,
};
const REPEAT_WORDS = { 'every day': 'daily', 'every week': 'weekly', 'every 2 weeks': 'fortnightly', 'every month': 'monthly' };

// Time from the regex groups: 23:00, 9:30, 11:00 PM, 11pm. Returns 'HH:MM', null (no time) or false (bad).
function readTime(h, m, ap) {
  if (h == null) return null;
  if (m == null && !ap) return false; // a bare number isn't a time
  let hh = Number(h);
  const mm = m == null ? 0 : Number(m);
  if (ap) {
    if (hh < 1 || hh > 12) return false;
    hh = (hh % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0);
  }
  const t = `${pad(hh)}:${pad(mm)}`;
  return isTime(t) ? t : false;
}
const realDate = (y, m, d) => {
  const s = `${y}-${pad(m)}-${pad(d)}`;
  if (!isDate(s) || m < 1 || m > 12 || d < 1) return null;
  return addDays(s, 0) === s ? s : null; // 31 Nov becomes 1 Dec, so it isn't a real date
};

// A date cell, or null when it doesn't look like a date. `today` = 'YYYY-MM-DD' (Sydney).
export function readDate(cell, today) {
  let m;
  let y; let mo; let d; let t;
  if ((m = cell.match(RE.iso))) { [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]; t = readTime(m[4], m[5], m[6]); }
  else if ((m = cell.match(RE.named))) {
    const k = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (k < 0) return null;
    [y, mo, d] = [m[3] ? Number(m[3]) : null, k + 1, Number(m[1])]; t = readTime(m[4], m[5], m[6]);
  } else if ((m = cell.match(RE.slash))) { [y, mo, d] = [m[3] ? Number(m[3]) : null, Number(m[2]), Number(m[1])]; t = readTime(m[4], m[5], m[6]); }
  else return null;
  if (t === false) return { error: `Can't read the time in “${cell}”. Use 23:00 or 11:00 PM.` };
  let due;
  if (y == null) {
    const thisYear = Number(today.slice(0, 4));
    due = realDate(thisYear, mo, d);
    if (due && daysBetween(due, today) > 60) due = realDate(thisYear + 1, mo, d);
  } else due = realDate(y, mo, d);
  if (!due) return { error: `“${cell}” isn't a real date.` };
  return { due, time: t };
}

// One line → { code, title, due?, time?, link?, details?, important?, repeat?, remind? } or { error }.
export function parseTaskLine(line, today) {
  const cells = line.split('|').map((x) => x.trim());
  const [code, title = '', ...rest] = cells;
  const out = { code, title };
  if (!code) return { ...out, error: 'The line needs a subject code before the first "|".' };
  for (const c of rest) {
    let m;
    if (!c) continue;
    if ((m = c.match(RE.link))) out.link = m[1].trim();
    else if ((m = c.match(RE.note))) out.details = m[1].trim();
    else if (RE.important.test(c)) out.important = true;
    else if ((m = c.match(RE.repeat))) { const w = m[1].toLowerCase(); out.repeat = REPEAT_WORDS[w] ?? w; }
    else if ((m = c.match(RE.remind))) out.remind = m[1] ? 0 : m[2] != null ? Number(m[2]) : 7;
    else {
      const d = readDate(c, today);
      if (d?.error) return { ...out, error: d.error };
      if (!d) return { ...out, error: `Can't read “${c}”. Expected a date like 3 Nov 23:00, link …, note …, important, repeat weekly or remind 2 days.` };
      if (out.due) return { ...out, error: 'The line has two dates.' };
      out.due = d.due;
      if (d.time) out.time = d.time;
    }
  }
  if (out.remind != null && !REMINDS.includes(out.remind)) return { ...out, error: 'Reminders can be on the day, 1, 2 or 7 days before.' };
  if (out.repeat && !REPEATS.includes(out.repeat)) return { ...out, error: 'Repeat can be daily, weekly, fortnightly or monthly.' };
  if (!out.title && !out.link) return { ...out, error: 'The line needs a task name after the subject.' };
  return out;
}

// The subject a code points at: one in the current session first, otherwise the most recent.
export function findSubject(code, subjects, current) {
  const k = codeKey(code);
  const list = subjects.filter((s) => codeKey(s.code) === k);
  if (list.length < 2) return list[0] ?? null;
  return list.find((s) => isCurrent(s, current))
    ?? [...list].sort((a, b) => (b.year - a.year) || (SESSIONS.indexOf(b.session) - SESSIONS.indexOf(a.session)))[0];
}

// Find the part a "link …" names in this subject. Returns { link } or { warning }.
export function findLink(s, name) {
  const want = squash(name).replace(/\s*(›|>)\s*/g, ' › ');
  const hits = linkOptions(s).flatMap((g) => g.parts.filter((p) => squash(p.title) === want || squash(`${g.name} › ${p.label}`) === want));
  if (hits.length === 1) return { link: { cid: hits[0].cid, iid: hits[0].iid } };
  if (hits.length > 1) return { warning: `“${name}” matches more than one part in ${s.code}. Write it as Assessment › Part. Added without a link.` };
  const has = linkOptions(s).length;
  return { warning: has ? `Couldn't find “${name}” in ${s.code}. Added without a link.` : `${s.code} has no assessments yet. Added without a link.` };
}

// Text → rows for the preview. Each row: { line, text, code, title, subject, kind, task, warnings, error, changes }
// kind: 'new' | 'update' | 'same' | 'done' | 'error'. `task` is the record to save (new or updated).
export function planTaskImport(text, { subjects = [], tasks = [], current = null, today, nowMs = Date.now() }) {
  const rows = [];
  const seen = new Set();
  let order = nowMs;
  String(text ?? '').split(/\r?\n/).forEach((raw, k) => {
    const text = raw.trim();
    if (!text || text.startsWith('#')) return;
    const p = parseTaskLine(text, today);
    const row = { line: k + 1, text, code: p.code, title: p.title, subject: null, kind: 'error', task: null, warnings: [], error: p.error ?? null, changes: [] };
    rows.push(row);
    if (row.error) return;
    const s = findSubject(p.code, subjects, current);
    if (!s) { row.error = `No subject “${p.code}” in gradi. Check the code, or add the subject first.`; return; }
    row.subject = s;
    let link;
    if (p.link) {
      const r = findLink(s, p.link);
      if (r.warning) row.warnings.push(r.warning);
      else link = r.link;
    }
    const title = p.title || (link ? (linkLabel(s, link) ?? '').split(' › ').pop() : '');
    if (!title) { row.error = 'The line needs a task name after the subject.'; return; }
    row.title = title;
    const key = `${s.uid}|${squash(title)}`;
    if (seen.has(key)) { row.error = 'Pasted twice: only the first one is used.'; return; }
    seen.add(key);

    const fields = {};
    if (p.due) { fields.due = p.due; fields.time = p.time ?? null; }
    if (link) fields.link = link;
    if (p.details != null) fields.details = p.details;
    if (p.important) fields.important = true;
    if (p.repeat) fields.repeat = p.repeat;
    if (p.remind != null) fields.remind = p.remind;
    if ((p.repeat || p.remind != null) && !p.due) row.warnings.push('Repeat and reminders need a due date; left out.');

    const old = tasks.find((t) => t.subjectUid === s.uid && squash(t.title) === squash(title));
    if (old) {
      if (old.status === 'done') { row.kind = 'done'; row.task = old; return; }
      const f = { ...fields };
      // A date given without a time clears the old time; repeat/remind only stay with a due date.
      if (!f.due && !isDate(old.due)) { delete f.repeat; delete f.remind; }
      const next = setTaskFields(old, f, nowMs);
      const changed = ['due', 'time', 'link', 'details', 'important', 'repeat', 'remind'].filter((x) => JSON.stringify(next[x] ?? null) !== JSON.stringify(old[x] ?? null));
      row.task = next;
      row.changes = changed;
      row.kind = changed.length ? 'update' : 'same';
      return;
    }
    const t = newTask({ title, subjectUid: s.uid, order: order++, ...fields }, nowMs);
    const target = linkTarget(s, t.link);
    if (target && isNum(target.i.score)) {
      t.status = 'done';
      t.doneAt = nowMs;
      row.warnings.push('Already marked, so it’s added as Done.');
    }
    row.kind = 'new';
    row.task = t;
  });
  return rows;
}

// The records to save from a plan (new + updated tasks).
export const tasksToSave = (rows) => rows.filter((r) => r.kind === 'new' || r.kind === 'update').map((r) => r.task);
