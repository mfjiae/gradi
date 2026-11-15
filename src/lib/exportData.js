// Export to Excel (M7, option A): everything in one file, one sheet each for Subjects, Assessments, Tasks,
// Plan and Hub. Marks stay plain numbers so Excel formulas work on them. Made on the device only; it cannot be restored
// into gradi (Download backup is the safety copy). Pure, tested (__tests__/export.test.js).
import { calc, result, keepBest, isNum, num, sessionKey, DEFAULT_TARGET } from './grades.js';
import { planStatus, degreeProgress, countsDegree, DEFAULT_DEGREE_TOTAL } from './plan.js';
import { STATUS_LABEL, REPEAT_LABEL, remindLabel } from './tasks.js';
import { todaySydney } from './backup.js';
import { makeXlsx } from './xlsx.js';
import { getHub } from './hub.js';

export const PLAN_LABEL = { done: 'Done', now: 'In progress', waiting: 'No result yet', enrolled: 'Enrolled', planned: 'Planned' };
const GRADE_NAME = { HD: 'HD', D: 'D', C: 'C', P: 'P', F: 'F', PASS: 'Pass, not graded' };
const r2 = (v) => (isNum(v) ? Math.round(v * 100) / 100 : null);
const yes = (b) => (b ? 'Yes' : 'No');
const bySession = (a, b) => sessionKey(a).localeCompare(sessionKey(b)) || String(a.code).localeCompare(String(b.code));

export function exportSheets({ subjects = [], tasks = [], current, degreeTotal = DEFAULT_DEGREE_TOTAL }) {
  const subs = [...subjects].sort(bySession);
  const codeOf = new Map(subs.map((s) => [s.uid, s.code]));

  const subjectRows = subs.map((s) => {
    const res = result(s);
    const r = calc(s);
    return [
      s.code, s.name || '', s.year, s.session, num(s.cp), PLAN_LABEL[planStatus(s, current)],
      res.grade ? (s.official ? GRADE_NAME[res.grade] : `${res.grade} so far`) : '',
      res.mark, res.gp, s.official ? null : r2(r.avg), num(s.target) ?? DEFAULT_TARGET,
      yes(s.countsGpa !== false), yes(s.countsWam !== false), yes(countsDegree(s)),
    ];
  });

  const assessmentRows = [];
  for (const s of subs) {
    for (const c of s.components ?? []) {
      const parts = c.single ? c.items.slice(0, 1) : c.items;
      const { out } = keepBest(c);
      for (const i of parts) {
        const marked = isNum(i.score) && isNum(i.max) && i.max > 0;
        const left = out.get(i.id);
        assessmentRows.push([
          s.code, s.year, s.session, c.name, num(c.weight), isNum(c.hurdle) ? c.hurdle : null, num(c.best),
          c.single ? '' : i.name, isNum(i.score) ? i.score : null, isNum(i.max) ? i.max : null,
          marked ? r2((i.score / i.max) * 100) : null,
          left === 'dropped' ? 'Not counted' : left === 'optional' ? 'Optional' : 'Yes',
        ]);
      }
    }
  }

  const taskRows = [...tasks]
    .sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')) || String(a.title).localeCompare(String(b.title)))
    .map((t) => [
      codeOf.get(t.subjectUid) ?? '', t.title, STATUS_LABEL[t.status] ?? t.status, t.due ?? '', t.time ?? '',
      t.important ? 'Yes' : '', t.repeat ? REPEAT_LABEL[t.repeat] ?? t.repeat : '',
      t.remind == null ? '' : remindLabel(t.remind), t.details ?? '',
      isNum(t.doneAt) ? todaySydney(new Date(t.doneAt)) : '',
    ]);

  // Hub (M8): links, contacts, revision topics, exam room / allowed items and notes, one row each.
  const hubRows = [];
  for (const s of subs) {
    const h = getHub(s);
    for (const l of h.links) hubRows.push([s.code, s.year, s.session, 'Link', l.name, l.url]);
    for (const c of h.contacts) hubRows.push([s.code, s.year, s.session, 'Contact', c.name, [c.role, c.reach].filter(Boolean).join(' · ')]);
    for (const t of h.topics) hubRows.push([s.code, s.year, s.session, 'Revision topic', t.name, t.done ? 'Done' : 'Not done']);
    if (h.exam.room) hubRows.push([s.code, s.year, s.session, 'Exam room', h.exam.room, '']);
    if (h.exam.allowed) hubRows.push([s.code, s.year, s.session, 'Exam allowed', h.exam.allowed, '']);
    if (h.notes) hubRows.push([s.code, s.year, s.session, 'Notes', h.notes, '']);
  }

  const p = degreeProgress(subs, current, degreeTotal);
  const planRows = subs.map((s) => [s.year, s.session, s.code, s.name || '', num(s.cp), PLAN_LABEL[planStatus(s, current)], yes(countsDegree(s))]);
  planRows.push(
    [],
    ['Degree total', null, null, null, p.total],
    ['Done', null, null, null, p.done],
    ['This session', null, null, null, p.now],
    ['Planned', null, null, null, p.planned],
    ['Not planned yet', null, null, null, p.left],
    ['Gained, not counted', null, null, null, p.notCounted],
  );

  return [
    { name: 'Subjects', header: ['Code', 'Name', 'Year', 'Session', 'Credit points', 'Status', 'Grade', 'Mark', 'Grade points', 'Average so far', 'Target', 'In GPA', 'In WAM', 'Counts toward degree'], rows: subjectRows },
    { name: 'Assessments', header: ['Subject', 'Year', 'Session', 'Assessment', 'Weight %', 'Hurdle %', 'Count best', 'Part', 'Score', 'Out of', 'Percent', 'Counted'], rows: assessmentRows },
    { name: 'Tasks', header: ['Subject', 'Task', 'Status', 'Due', 'Time', 'Important', 'Repeat', 'Reminder', 'Details', 'Done on'], rows: taskRows },
    { name: 'Plan', header: ['Year', 'Session', 'Code', 'Name', 'Credit points', 'Status', 'Counts toward degree'], rows: planRows },
    { name: 'Hub', header: ['Subject', 'Year', 'Session', 'Type', 'Name', 'Detail'], rows: hubRows },
  ];
}

export const exportFileName = (d = new Date()) => `gradi-export-${todaySydney(d)}.xlsx`;
export const buildExport = (data) => makeXlsx(exportSheets(data));
