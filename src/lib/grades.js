// gradi grade maths. Plain functions, no database, no screen code, all tested (__tests__/grades.test.js).
// Ken confirms any change to these rules first (see CLAUDE.md "Grade maths").
//
// A subject record:
//   { uid, code, name, year, session ('Autumn'|'Spring'|'Summer'), cp, target,
//     components: [{ id, name, weight, single, hurdle, best (count the best N parts, or null), items: [{ id, name, score, max, w }] }],
//     official: { grade: 'HD'|'D'|'C'|'P'|'F'|'PASS', mark: number|null } | null,
//     countsGpa (default true), countsWam (default true), updatedAt }
// Marks and weights stay plain numbers. Rounding happens only for display (fmt) and for required marks (ceil1).

export const BANDS = [
  { k: 'HD', min: 85, gp: 7, c: '--hd' },
  { k: 'D', min: 75, gp: 6, c: '--d' },
  { k: 'C', min: 65, gp: 5, c: '--c' },
  { k: 'P', min: 50, gp: 4, c: '--p' },
  { k: 'F', min: 0, gp: 0, c: '--f' },
];
export const FAIL = BANDS[4];
export const PASS_BAND = { k: 'Pass', gp: null, c: '--other' };
// Official grades you can record. PASS = "Pass, not graded": no grade points, not in GPA or WAM.
export const OFFICIAL_GRADES = ['HD', 'D', 'C', 'P', 'F', 'PASS'];
const GP = { HD: 7, D: 6, C: 5, P: 4, F: 0 };

export const SESSIONS = ['Autumn', 'Spring', 'Summer'];
const SESSION_ORDER = { Autumn: 1, Spring: 2, Summer: 3 };
export const DEFAULT_TARGET = 85;
export const DEFAULT_CP = 6;

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export function num(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}
// Display only. d = 1: up to one decimal, trailing zero dropped (86, 74.7). d = 2: always two (6.25).
export function fmt(n, d = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return d === 2 ? n.toFixed(2) : String(Number(n.toFixed(d)));
}
// Required marks round UP to one decimal so the target is actually met. The 1e-9 stops 84.4 becoming 84.5 from float noise.
export const ceil1 = (n) => Math.ceil(n * 10 - 1e-9) / 10;

// Bands use the whole-number mark: 84.5 rounds to 85 = HD.
export const band = (mark) => BANDS.find((b) => Math.round(mark) >= b.min) || FAIL;

const isMarked = (i) => isNum(i.score) && isNum(i.max) && i.max > 0;
const partPct = (i) => i.score / i.max;

// "Count the best N of M parts" for a split component (c.best = N). Rule agreed with Ken (28 Oct 2026):
//  - Marked parts are ranked by percent (ties: the earlier part wins). The best N marked parts count.
//  - Nothing is dropped until more than N parts are marked; the lowest marked ones are then "Not counted".
//  - While fewer than N are marked, the first unmarked parts fill the remaining slots (they are still to come);
//    any other unmarked parts are "Optional": they only count once marked and better than a counted one.
//  - No rule (best empty, or N >= number of parts, or a single mark): every part counts.
//  - An official result still wins over all of this for the subject.
// Returns keep (ids that count) and out (id -> 'dropped' | 'optional').
export function keepBest(c) {
  const all = c.single ? c.items.slice(0, 1) : c.items;
  const N = num(c.best);
  const keep = new Set(all.map((i) => i.id));
  const out = new Map();
  if (c.single || N == null || !Number.isInteger(N) || N < 1 || N >= all.length) return { keep, out };
  const marked = all.map((i, k) => ({ i, k })).filter((x) => isMarked(x.i))
    .sort((a, b) => partPct(b.i) - partPct(a.i) || a.k - b.k);
  const kept = marked.slice(0, N);
  const free = N - kept.length;
  const pendingKept = all.filter((i) => !isMarked(i)).slice(0, free);
  keep.clear();
  for (const x of kept) keep.add(x.i.id);
  for (const i of pendingKept) keep.add(i.id);
  for (const i of all) if (!keep.has(i.id)) out.set(i.id, isMarked(i) ? 'dropped' : 'optional');
  return { keep, out };
}

// One subject's numbers from its components.
// assume(p) (optional) returns a what-if percent for each unmarked part p; the result then includes proj.
export function calc(s, assume) {
  const components = s?.components ?? [];
  const W = components.reduce((a, c) => a + (num(c.weight) || 0), 0);
  const scale = W > 0 ? 100 / W : 0; // weights that don't add to 100 are scaled to 100
  let earned = 0;
  let gradedW = 0;
  const pending = [];
  const comps = [];
  for (const c of components) {
    const cw = num(c.weight) || 0;
    const all = c.single ? c.items.slice(0, 1) : c.items;
    // "Count the best N" (Ken, 28 Oct 2026): see keepBest. Parts left out still show, they just don't count.
    const { keep, out } = keepBest(c);
    const items = all.filter((i) => keep.has(i.id));
    // Parts are weighted by points (total scored / total available), the way Canvas does it.
    // A part's own w (custom weight) is a later extra; null means "use its points".
    const wOf = (i) => (c.single ? 1 : (num(i.w) ?? (isNum(i.max) && i.max > 0 ? i.max : 1)));
    const sw = items.reduce((a, i) => a + wOf(i), 0) || 1;
    let ce = 0; // fraction of this component earned
    let cg = 0; // fraction of this component marked
    for (const i of items) {
      const share = wOf(i) / sw;
      if (isMarked(i)) {
        cg += share;
        ce += (share * i.score) / i.max;
      } else {
        pending.push({ cid: c.id, iid: i.id, label: c.single ? c.name : `${c.name} · ${i.name}`, pts: share * cw * scale, max: num(i.max) });
      }
    }
    const pct = cg > 0 ? (ce / cg) * 100 : null;
    let hs = null; // hurdle state
    if (isNum(c.hurdle) && pct != null) hs = pct >= c.hurdle ? 'ok' : cg >= 0.999 ? 'fail' : 'risk';
    earned += ce * cw;
    gradedW += cg * cw;
    comps.push({ c, pct, cg, pts: ce * cw * scale, maxPts: cw * scale, hs, out });
  }
  const banked = earned * scale; // points banked out of 100
  const gradedPts = gradedW * scale; // points marked so far out of 100
  const remaining = W > 0 ? Math.max(0, 100 - gradedPts) : 0;
  const avg = gradedPts > 0.0001 ? (banked / gradedPts) * 100 : null; // average on what's marked
  const T = num(s?.target) ?? DEFAULT_TARGET;
  const req = remaining > 0.0001 ? ((T - banked) / remaining) * 100 : null;
  let state = 'empty';
  if (W > 0) state = banked >= T - 1e-9 ? 'secured' : remaining <= 0.0001 ? 'missed' : req > 100 ? 'out' : 'need';
  let proj = null;
  if (assume && W > 0) {
    proj = banked;
    for (const p of pending) proj += (p.pts * assume(p)) / 100;
  }
  const hurdleFail = comps.find((x) => x.hs === 'fail') || null;
  return { W, banked, gradedPts, remaining, avg, best: banked + remaining, T, req, state, pending, comps, proj, hurdleFail };
}

// "What do I need?": the average needed on what's left, and per unmarked part the score that gives it.
export function needed(r) {
  if (r.state !== 'need') return null;
  const q = Math.max(0, ceil1(r.req));
  return {
    pct: q,
    parts: r.pending.map((p) => ({ ...p, score: isNum(p.max) && q > 0 ? ceil1((q / 100) * p.max) : null })),
  };
}

// The band a subject is heading for from its components (a failed hurdle means F).
export const subBand = (r) => (r.hurdleFail ? FAIL : r.avg == null ? null : band(r.avg));

// The band shown for a subject: the official grade if there is one, else from its marks.
export function bandOf(s, r = calc(s)) {
  if (s.official) return BANDS.find((b) => b.k === s.official.grade) || PASS_BAND;
  return subBand(r);
}

// A subject's result: official if recorded, else the current average (mark = whole number).
export function result(s) {
  if (s.official) {
    const g = s.official.grade;
    return { grade: g, gp: GP[g] ?? null, mark: isNum(s.official.mark) ? s.official.mark : null, official: true };
  }
  const r = calc(s);
  const b = subBand(r);
  return { grade: b ? b.k : null, gp: b ? b.gp : null, mark: r.avg == null ? null : Math.round(r.avg), official: false };
}

// GPA, WAM and friends over a list of subjects.
//  gpa: grade points weighted by credit points (subjects with a grade that count in GPA).
//  avg (WAM): marks weighted by credit points (subjects with a mark that count in WAM).
//  gpaTarget: official subjects at their grade, the rest at their target's band.
//  gpaProj: only when assumeFor is given; unfinished subjects at their what-if mark.
//  gained: credit points from official results that aren't F (Pass, not graded counts).
// onlyOfficial: use only subjects with an official result (Home's "all sessions" numbers).
export function overall(subjects, { onlyOfficial = false, assumeFor = null } = {}) {
  let cpG = 0, gp = 0, cpM = 0, mk = 0, cpT = 0, gpT = 0, cpP = 0, gpP = 0, gained = 0;
  for (const s of subjects) {
    if (onlyOfficial && !s.official) continue;
    const cp = num(s.cp) || 0;
    const res = result(s);
    const inGpa = s.countsGpa !== false;
    if (res.gp != null && inGpa) { cpG += cp; gp += cp * res.gp; }
    if (inGpa) {
      // An unfinished subject counts at its target even before it has marks.
      const tgp = s.official ? res.gp : band(num(s.target) ?? DEFAULT_TARGET).gp;
      if (tgp != null) { cpT += cp; gpT += cp * tgp; }
    }
    if (res.mark != null && s.countsWam !== false) { cpM += cp; mk += cp * res.mark; }
    if (s.official && res.grade !== 'F') gained += cp;
    if (!s.official && assumeFor && inGpa) {
      const r = calc(s, assumeFor(s));
      if (r.proj != null) { cpP += cp; gpP += cp * (r.hurdleFail ? 0 : band(r.proj).gp); }
    }
  }
  return {
    gpa: cpG ? gp / cpG : null,
    avg: cpM ? mk / cpM : null,
    gpaTarget: cpT ? gpT / cpT : null,
    gpaProj: cpP ? gpP / cpP : null,
    gained,
  };
}

/* ---------- sessions ---------- */
export const sessionKey = (x) => `${x.year}-${SESSION_ORDER[x.session] || 2}`;
export const sessionName = (x) => `${x.session} ${x.year}`;
export const isCurrent = (s, cur) => !!cur && s.year === cur.year && s.session === cur.session;

// Subjects grouped by session, newest session first.
export function groupSessions(subjects) {
  const m = new Map();
  for (const s of subjects) {
    const k = sessionKey(s);
    if (!m.has(k)) m.set(k, { key: k, year: s.year, session: s.session, subs: [] });
    m.get(k).subs.push(s);
  }
  return [...m.values()].sort((a, b) => b.key.localeCompare(a.key));
}

// First-run guess for the current UTS session from the date (you can change it in Settings).
// Autumn = Feb to Jun, Spring = Jul to Nov, Summer = Dec to Jan (January belongs to the previous year's Summer).
export function guessSession(d = new Date()) {
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  if (m >= 2 && m <= 6) return { year: y, session: 'Autumn' };
  if (m >= 7 && m <= 11) return { year: y, session: 'Spring' };
  return { year: m === 1 ? y - 1 : y, session: 'Summer' };
}

// Years offered in the year pickers: FIRST_YEAR up to the current calendar year (Sydney time), so a new year
// appears by itself on 1 January. Years already used by saved subjects, and the current session's year, are
// always included even if outside that range. Ascending.
export const FIRST_YEAR = 2025;
export const calendarYear = (now = new Date()) =>
  Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric' }).format(now));
export function yearOptions(extra = [], now = new Date()) {
  const set = new Set();
  for (let y = FIRST_YEAR; y <= calendarYear(now); y++) set.add(y);
  for (const y of extra) if (Number.isInteger(y) && y > 1900 && y < 3000) set.add(y);
  return [...set].sort((a, b) => a - b);
}

/* ---------- Home ---------- */
// The marks still to come in a list of subjects, biggest first.
export function pendingAcross(subjects, limit = 6) {
  return subjects
    .flatMap((s) => calc(s).pending.map((p) => ({ ...p, code: s.code, sid: s.uid })))
    .sort((a, b) => b.pts - a.pts)
    .slice(0, limit);
}

// The what-if slider starting value for a part: your average so far, or 70 if nothing is marked.
export const defaultWhatIf = (r) => Math.max(0, Math.min(100, Math.round(r.avg ?? 70)));
