// Import from text: turns the plain text Claude makes from Ken's screenshots into subject records.
// Pure functions (no database, no screen code), tested in __tests__/importText.test.js.
//
// Format (a blank line starts the next subject; lines starting with # are ignored):
//   CODE: Name | Autumn 2026 | 6cp | D 77 | target 85 | no gpa | no wam
//   Task 1 | 25% | 5/5, 20/20
//   Quizzes | 30% | Quiz 1=8/10, Quiz 2=-/10
//   Final exam | 40% | -/100 | hurdle 50
// First line: code (name optional after ":") and session + year are required; the rest is optional, any order.
// Assessment line: name | weight | marks | hurdle. One unnamed mark = a single mark; several marks (or a named one)
// = parts. "-" as the score = not marked yet. Unnamed parts become Part 1, Part 2.
import { newSubject } from './edit.js';
import { DEFAULT_CP } from './grades.js';

const NUM = '(\\d+(?:\\.\\d+)?)';
const RE = {
  session: new RegExp(`^(autumn|spring|summer)\\s+(\\d{4})$`, 'i'),
  sessionYearFirst: new RegExp(`^(\\d{4})\\s+(autumn|spring|summer)$`, 'i'),
  cp: new RegExp(`^${NUM}\\s*cp$`, 'i'),
  grade: new RegExp(`^(HD|D|C|P|F)(?:\\s+${NUM})?$`, 'i'),
  pass: /^pass$/i,
  target: new RegExp(`^target\\s+${NUM}\\s*%?$`, 'i'),
  noGpa: /^no\s+gpa$/i,
  noWam: /^no\s+wam$/i,
  weight: new RegExp(`^${NUM}\\s*%?$`),
  hurdle: new RegExp(`^hurdle\\s*${NUM}\\s*%?$`, 'i'),
  mark: new RegExp(`^(-|${NUM})?\\s*/\\s*${NUM}$`),
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const pid = () => Math.random().toString(36).slice(2, 10);
const cells = (line) => line.split('|').map((x) => x.trim());

// Same subject = same code (ignoring case and spaces), year and session.
export const subjectKey = (s) => `${String(s.code).replace(/\s+/g, '').toUpperCase()}|${s.year}|${s.session}`;

function parseHeader(line, n, problems) {
  const [first, ...rest] = cells(line);
  const colon = first.indexOf(':');
  const code = (colon >= 0 ? first.slice(0, colon) : first).trim();
  const name = colon >= 0 ? first.slice(colon + 1).trim() : null;
  const h = { line: n, code, name, year: null, session: null, cp: null, target: null, official: null, countsGpa: null, countsWam: null };
  let ok = true;
  const err = (text) => { problems.push({ line: n, level: 'error', code: code || null, text }); ok = false; };
  if (!code) err('The subject line needs a code before the first "|".');
  for (const c of rest) {
    let m;
    if (!c) continue;
    if ((m = c.match(RE.session))) { h.session = cap(m[1]); h.year = Number(m[2]); }
    else if ((m = c.match(RE.sessionYearFirst))) { h.session = cap(m[2]); h.year = Number(m[1]); }
    else if ((m = c.match(RE.cp))) h.cp = Number(m[1]);
    else if (RE.pass.test(c)) h.official = { grade: 'PASS', mark: null };
    else if ((m = c.match(RE.grade))) h.official = { grade: m[1].toUpperCase(), mark: m[2] != null ? Number(m[2]) : null };
    else if ((m = c.match(RE.target))) h.target = Number(m[1]);
    else if (RE.noGpa.test(c)) h.countsGpa = false;
    else if (RE.noWam.test(c)) h.countsWam = false;
    else err(`Can't read “${c}” on the subject line. Expected a session like Autumn 2026, credit points like 6cp, or a result like D 77.`);
  }
  if (code && !h.session) err('The subject line needs a session and year, like Autumn 2026.');
  if (h.target != null && (h.target < 0 || h.target > 100)) err(`Target ${h.target} must be between 0 and 100.`);
  if (h.official?.mark != null && h.official.mark > 100) err(`Official mark ${h.official.mark} is more than 100.`);
  return ok ? h : null;
}

function parseMarks(text, n, code, problems) {
  const entries = text.split(',').map((x) => x.trim()).filter(Boolean);
  if (!entries.length) return null;
  const items = [];
  let named = false;
  for (const [k, e] of entries.entries()) {
    const eq = e.lastIndexOf('=');
    const name = eq >= 0 ? e.slice(0, eq).trim() : '';
    const m = (eq >= 0 ? e.slice(eq + 1) : e).trim().match(RE.mark);
    if (!m) {
      problems.push({ line: n, level: 'error', code, text: `Can't read the mark “${e}”. Write it as score/max, like 12/40, or -/40 if it isn't marked.` });
      return undefined;
    }
    const max = Number(m[3]);
    if (!(max > 0)) {
      problems.push({ line: n, level: 'error', code, text: `“${e}” is out of 0. The max must be more than 0.` });
      return undefined;
    }
    const score = m[1] == null || m[1] === '-' ? null : Number(m[2]);
    if (score != null && score > max) problems.push({ line: n, level: 'warn', code, text: `${e} scores more than the max. Imported as written.` });
    if (name) named = true;
    items.push({ id: pid(), name: name || `Part ${k + 1}`, score, max, w: null });
  }
  if (items.length === 1 && !named) items[0].name = 'Mark';
  return { single: items.length === 1 && !named, items };
}

function parseComponent(line, n, code, problems) {
  const [name, weightText = '', marksText = '', ...extra] = cells(line);
  const err = (text) => { problems.push({ line: n, level: 'error', code, text }); return null; };
  if (!name) return err('An assessment line needs a name before the first "|".');
  const w = weightText.match(RE.weight);
  if (!w) return err(`Can't read the weight “${weightText}” for ${name}. Write it like 25%.`);
  let hurdle = null;
  for (const c of extra) {
    if (!c) continue;
    const m = c.match(RE.hurdle);
    if (!m) return err(`Can't read “${c}” for ${name}. Only "hurdle 50" can go after the marks.`);
    hurdle = Number(m[1]);
    if (hurdle > 100) return err(`Hurdle ${hurdle} for ${name} is more than 100%.`);
  }
  let marks = { single: true, items: [{ id: pid(), name: 'Mark', score: null, max: 100, w: null }] };
  if (marksText) {
    const parsed = parseMarks(marksText, n, code, problems);
    if (parsed === undefined) return null;
    if (parsed) marks = parsed;
  }
  return { id: pid(), name, weight: Number(w[1]), hurdle, ...marks };
}

// Text -> { blocks, problems }. A block = one subject's parsed fields; a block with any error is left out
// (its problems say why). Problems carry the line number so Ken can fix the text.
export function parseImport(text) {
  const problems = [];
  const groups = [];
  let cur = null;
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { cur = null; return; }
    if (line.startsWith('#')) return;
    if (!cur) { cur = { start: i + 1, lines: [] }; groups.push(cur); }
    cur.lines.push({ n: i + 1, line });
  });

  const blocks = [];
  const seen = new Map();
  for (const g of groups) {
    const before = problems.length;
    const head = parseHeader(g.lines[0].line, g.lines[0].n, problems);
    const code = head?.code ?? (cells(g.lines[0].line)[0].split(':')[0].trim() || null);
    const components = [];
    for (const { n, line } of g.lines.slice(1)) {
      const c = parseComponent(line, n, code, problems);
      if (c) components.push(c);
    }
    const failed = problems.slice(before).some((p) => p.level === 'error');
    if (!head || failed) {
      if (code) problems.push({ line: g.start, level: 'skip', code, text: `${code} is skipped until its errors are fixed.` });
      continue;
    }
    const key = subjectKey(head);
    if (seen.has(key)) {
      problems.push({ line: g.start, level: 'error', code, text: `${code} ${head.session} ${head.year} is pasted twice (lines ${seen.get(key)} and ${g.start}). Only the first is imported.` });
      continue;
    }
    seen.set(key, g.start);
    const W = components.reduce((a, c) => a + c.weight, 0);
    if (components.length && Math.abs(W - 100) > 0.001) {
      problems.push({ line: g.start, level: 'warn', code, text: `Weights add to ${Math.round(W * 100) / 100}%. Marks scale to 100 until you fix it. It still imports.` });
    }
    blocks.push({ ...head, components });
  }
  problems.sort((a, b) => a.line - b.line);
  return { blocks, problems };
}

// How a component's marks read in the preview: "5/5", "Quiz 1 8/10", "-/100".
export function markLabels(c) {
  const items = c.single ? c.items.slice(0, 1) : c.items;
  return items.map((i) => `${c.single ? '' : `${i.name} `}${i.score == null ? '-' : i.score}/${i.max}`);
}
const compSig = (c) => JSON.stringify([c.weight, c.hurdle ?? null, markLabels(c)]);

// Parsed blocks + subjects already saved -> what Import will do. Never deletes anything.
//  new: a fresh subject. update: same code + year + session as a saved one; its assessments are replaced by the
//  pasted ones (kept if none were pasted); name, cp, target, result and the GPA/WAM switches change only when the
//  text gives them. same: the text matches what's saved, so nothing is written.
export function planImport(blocks, existing = []) {
  const byKey = new Map(existing.map((s) => [subjectKey(s), s]));
  return blocks.map((b) => {
    const old = byKey.get(subjectKey(b));
    const base = old ? structuredClone(old) : newSubject({ code: b.code, year: b.year, session: b.session });
    const next = { ...base, code: old ? old.code : b.code };
    if (b.name != null) next.name = b.name;
    if (b.cp != null) next.cp = b.cp;
    else if (!old) next.cp = DEFAULT_CP;
    if (b.target != null) next.target = b.target;
    if (b.official) next.official = { ...b.official };
    if (b.countsGpa === false) next.countsGpa = false;
    if (b.countsWam === false) next.countsWam = false;
    if (b.components.length || !old) next.components = b.components.map((c) => structuredClone(c));

    if (!old) return { status: 'new', line: b.line, subject: next, changes: [] };
    const oldByName = new Map(old.components.map((c) => [c.name.trim().toLowerCase(), c]));
    const changes = b.components.length
      ? next.components.map((c) => {
        const was = oldByName.get(c.name.trim().toLowerCase());
        return { id: c.id, was: was ? markLabels(was) : null, isNew: !was, changed: !was || compSig(was) !== compSig(c) };
      })
      : [];
    const sameComps = !b.components.length
      || (old.components.length === next.components.length && old.components.every((c, k) => c.name === next.components[k].name && compSig(c) === compSig(next.components[k])));
    const strip = (s) => JSON.stringify({ ...s, components: null, updatedAt: null });
    const same = sameComps && strip(old) === strip(next);
    return {
      status: same ? 'same' : 'update',
      line: b.line,
      subject: same ? old : next,
      old,
      changes,
      replaced: b.components.length ? old.components.length : null,
    };
  });
}

