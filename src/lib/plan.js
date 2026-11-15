// Degree planner maths (M7, 15 Nov 2026). Plain functions, no database, no screen code, tested (__tests__/plan.test.js).
// Rules agreed with Ken (see CLAUDE.md "Degree planner"); confirm with him before changing.
//
// A planned subject is an ordinary subject record in a session after the current one. Extra subject fields:
//   countsDegree (default true): false = credit points gained but not counted toward this degree (old major).
//   enrolled (default false): a future subject you are already enrolled in ("Enrolled" pill), else "Planned".
// The degree total lives in meta 'degree' { total, updatedAt } and syncs (newest edit wins), default 198.
import { num, result, calc, subBand, sessionKey, isCurrent, SESSIONS } from './grades.js';

export const DEFAULT_DEGREE_TOTAL = 198;
export const LOAD_APPROVAL = 27; // above this a session needs an "Exceed cp limit" approval (Ken's figure)
export const LOAD_MAX = 30; // above this is shown as "Over 30 cp"
export const FUTURE_YEARS = 6; // how far ahead the year pickers and the move arrows reach

const cpOf = (s) => num(s.cp) || 0;
export const countsDegree = (s) => s.countsDegree !== false;
export const isFuture = (s, cur) => !!cur && sessionKey(s) > sessionKey(cur);
export const isPast = (s, cur) => !!cur && sessionKey(s) < sessionKey(cur);
const gained = (s) => !!s.official && s.official.grade !== 'F';

// What a subject is in the plan:
//  done      official result (F included: it shows its grade but gains nothing)
//  now       current session, no result yet
//  waiting   an earlier session with no result recorded (counts like "now": still to be finished)
//  enrolled  a later session, already enrolled
//  planned   a later session, not enrolled yet
export function planStatus(s, cur) {
  if (s.official) return 'done';
  if (isCurrent(s, cur)) return 'now';
  if (isFuture(s, cur)) return s.enrolled ? 'enrolled' : 'planned';
  return 'waiting';
}

// Progress toward the degree, in credit points. Only subjects that count toward the degree are in done/now/planned.
//  done: official results that aren't F. now: unfinished subjects in the current or an earlier session.
//  planned: subjects in later sessions. left: credit points with no session yet. over: planned beyond the total.
//  notCounted: credit points gained that don't count toward this degree.
export function degreeProgress(subjects, cur, total = DEFAULT_DEGREE_TOTAL) {
  let done = 0, now = 0, planned = 0, notCounted = 0;
  for (const s of subjects) {
    const cp = cpOf(s);
    if (!countsDegree(s)) { if (gained(s)) notCounted += cp; continue; }
    if (s.official) { if (gained(s)) done += cp; continue; }
    if (isFuture(s, cur)) planned += cp; else now += cp;
  }
  const T = num(total) ?? DEFAULT_DEGREE_TOTAL;
  const sum = done + now + planned;
  return { total: T, done, now, planned, left: Math.max(0, T - sum), over: Math.max(0, sum - T), notCounted };
}

// The session the degree finishes in: the last session holding an unfinished subject that counts, once every
// credit point has a session. null while credit points are still unplanned. If nothing is left to do, the last
// session with a counted result.
export function finishSession(subjects, cur, total = DEFAULT_DEGREE_TOTAL) {
  if (degreeProgress(subjects, cur, total).left > 0) return null;
  const counted = subjects.filter(countsDegree);
  const open = counted.filter((s) => !s.official);
  const pool = open.length ? open : counted.filter(gained);
  if (!pool.length) return null;
  const last = pool.reduce((a, s) => (sessionKey(s) > sessionKey(a) ? s : a));
  return { year: last.year, session: last.session, key: sessionKey(last) };
}

export function loadState(cp) {
  if (cp > LOAD_MAX) return { k: 'bad', label: `Over ${LOAD_MAX} cp` };
  if (cp > LOAD_APPROVAL) return { k: 'warn', label: 'Needs approval' };
  return { k: 'ok', label: 'Normal load' };
}

// GPA at graduation, rule 2 (Ken, 15 Nov 2026):
//  - official results as they are (Pass, not graded has no grade points),
//  - unfinished subjects that already have marks, at their grade so far (whole-number band; a failed hurdle = F),
//  - every other unfinished subject at `avg` grade points (the slider, 4 to 7).
// Only subjects that count in GPA (countsGpa). Weighted by credit points like every GPA in gradi.
export function gradGpa(subjects, avg) {
  const a = num(avg) ?? 0;
  let offCp = 0, offPts = 0, markCp = 0, markPts = 0, restCp = 0;
  for (const s of subjects) {
    if (s.countsGpa === false) continue;
    const cp = cpOf(s);
    if (s.official) {
      const gp = result(s).gp;
      if (gp != null) { offCp += cp; offPts += cp * gp; }
      continue;
    }
    const b = subBand(calc(s));
    if (b) { markCp += cp; markPts += cp * b.gp; } else restCp += cp;
  }
  const cp = offCp + markCp + restCp;
  return {
    gpa: cp ? (offPts + markPts + restCp * a) / cp : null,
    offCp, offGpa: offCp ? offPts / offCp : null,
    markCp, markGpa: markCp ? markPts / markCp : null,
    restCp,
  };
}

// The session one step earlier (dir -1) or later (dir +1), using Autumn and Spring only (Summer moves to its
// neighbours). Autumn y <-> Spring y <-> Autumn y+1.
export function shiftSession({ year, session }, dir) {
  if (dir > 0) return session === 'Autumn' ? { year, session: 'Spring' } : { year: year + 1, session: 'Autumn' };
  if (session === 'Spring') return { year, session: 'Autumn' };
  if (session === 'Summer') return { year, session: 'Spring' };
  return { year: year - 1, session: 'Spring' };
}
// Move arrows work only on unfinished subjects in later sessions, and never move one into the current session
// or earlier, or more than FUTURE_YEARS past the current year.
export function canShift(s, dir, cur) {
  if (s.official || !isFuture(s, cur)) return false;
  const t = shiftSession(s, dir);
  return dir > 0 ? t.year <= cur.year + FUTURE_YEARS : sessionKey(t) > sessionKey(cur);
}

// The Plan list (layout B, fold style A): this year's sessions first (always open; the current session is always
// there, even empty), then each later year, then earlier years ("Past sessions"). Sessions in calendar order.
export function planGroups(subjects, cur) {
  const m = new Map();
  const add = (year, session) => {
    const k = sessionKey({ year, session });
    if (!m.has(k)) m.set(k, { key: k, year, session, subs: [], cp: 0 });
    return m.get(k);
  };
  add(cur.year, cur.session);
  for (const s of subjects) { const x = add(s.year, s.session); x.subs.push(s); x.cp += cpOf(s); }
  const order = { done: 0, waiting: 1, now: 1, enrolled: 2, planned: 3 };
  const sessions = [...m.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const x of sessions) x.subs.sort((a, b) => order[planStatus(a, cur)] - order[planStatus(b, cur)] || String(a.code).localeCompare(String(b.code)));
  const byYear = (list) => {
    const ys = new Map();
    for (const x of list) { if (!ys.has(x.year)) ys.set(x.year, { year: x.year, sessions: [], cp: 0 }); const y = ys.get(x.year); y.sessions.push(x); y.cp += x.cp; }
    return [...ys.values()];
  };
  return {
    thisYear: sessions.filter((x) => x.year === cur.year),
    later: byYear(sessions.filter((x) => x.year > cur.year)),
    past: byYear(sessions.filter((x) => x.year < cur.year)),
  };
}

// Sessions from the current one on that have subjects (the current one always), for "Load per session".
export function upcomingLoads(subjects, cur) {
  const g = planGroups(subjects, cur);
  return [...g.thisYear, ...g.later.flatMap((y) => y.sessions)]
    .filter((x) => x.key >= sessionKey(cur) && (x.subs.length || x.key === sessionKey(cur)))
    .map((x) => ({ ...x, state: loadState(x.cp) }));
}

// The first session after the current one (where "Add subject" in the planner starts).
export const nextSession = (cur) => shiftSession(cur, 1);

// A slider starting value: the current official GPA to one decimal, kept between 4 and 7.
export function defaultAvg(subjects) {
  const g = gradGpa(subjects.filter((s) => s.official), 0).offGpa;
  return g == null ? 6 : Math.max(4, Math.min(7, Math.round(g * 10) / 10));
}

export { SESSIONS };
