// Fake sample subjects (the prototype's), so you can try gradi before entering real grades.
// Settings offers them only while there are no subjects. Never real grades.
import { newUid } from './edit.js';

let k = 0;
const pid = () => `s${(++k).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const comp = (name, weight, items, o = {}) => ({
  id: pid(), name, weight, single: items.length === 1 && !o.group, hurdle: o.hurdle ?? null,
  items: items.map(([score, max, n], i) => ({ id: pid(), name: n || (items.length === 1 && !o.group ? 'Mark' : `Part ${i + 1}`), score, max, w: null })),
});
const mk = (code, name, year, session, cp, target, components, extra = {}) => ({
  uid: newUid(), code, name, year, session, cp, target, components, official: null, countsGpa: true, countsWam: true, ...extra,
});

// cur = the session the "current" samples are in.
export function sampleSubjects(cur = { year: 2026, session: 'Spring' }) {
  const y = cur.year;
  const prev = cur.session === 'Spring' ? { year: y, session: 'Autumn' } : cur.session === 'Summer' ? { year: y, session: 'Spring' } : { year: y - 1, session: 'Spring' };
  const older = { year: prev.year - 1, session: prev.session };
  return [
    mk('SAMPLE_A', 'Motors (sample)', cur.year, cur.session, 6, 85, [
      comp('Assignment 1', 20, [[17, 20]]),
      comp('Labs', 20, [[9, 10, 'Lab 1'], [8, 10, 'Lab 2'], [10, 10, 'Lab 3'], [null, 10, 'Lab 4'], [null, 10, 'Lab 5']], { group: true }),
      comp('Quizzes', 10, [[4, 5, 'Quiz 1'], [null, 5, 'Quiz 2'], [null, 5, 'Quiz 3']], { group: true }),
      comp('Final exam', 50, [[null, 100]], { hurdle: 40 })]),
    mk('SAMPLE_B', 'Circuits (sample)', cur.year, cur.session, 6, 75, [
      comp('Assignment 1', 15, [[11, 15]]), comp('Mid-term', 25, [[52, 80]]), comp('Assignment 2', 20, [[null, 100]]),
      comp('Final exam', 40, [[null, 100]], { hurdle: 50 })]),
    mk('SAMPLE_C', 'Elective (sample)', cur.year, cur.session, 6, 65, [
      comp('Essay', 40, [[68, 100]]), comp('Presentation', 20, [[15, 20]]), comp('Final exam', 40, [[null, 100]])]),
    mk('SAMPLE_D', 'Digital (sample)', prev.year, prev.session, 6, 85, [
      comp('Quizzes', 50, [[10, 10, 'Quiz 1'], [7, 10, 'Quiz 2'], [8, 10, 'Quiz 3'], [10, 10, 'Quiz 4'], [9, 10, 'Quiz 5']], { group: true }),
      comp('Labs', 50, [[10, 10, 'Lab 1'], [10, 10, 'Lab 2'], [10, 10, 'Lab 3'], [10, 10, 'Lab 4'], [10, 10, 'Lab 5']], { group: true })],
    { official: { grade: 'HD', mark: 94 } }),
    mk('SAMPLE_E', 'Studio (sample)', prev.year, prev.session, 6, 65, [
      comp('Task 1', 20, [[null, 100]]), comp('Task 2', 20, [[null, 100]]), comp('Task 3', 20, [[null, 100]]), comp('Task 4', 40, [[null, 100]])],
    { official: { grade: 'C', mark: null }, countsWam: false }),
    mk('SAMPLE_F', 'Practice (sample)', prev.year, prev.session, 3, 50, [], { official: { grade: 'PASS', mark: null } }),
    mk('SAMPLE_G', 'Projects (sample)', older.year, older.session, 6, 75, [
      comp('Task 1', 25, [[4, 5, 'Part A'], [18, 20, 'Part B']], { group: true }),
      comp('Task 2', 45, [[9, 10, 'Draft'], [24, 35, 'Report']], { group: true }),
      comp('Task 3', 30, [[50, 70, 'Group'], [20, 30, 'Individual']], { group: true })],
    { official: { grade: 'D', mark: 76 } }),
    mk('SAMPLE_H', 'Maths (sample)', older.year, older.session, 6, 85, [
      comp('Skills tests', 60, [[5, 6, 'Test 1'], [6, 6, 'Test 2'], [4, 6, 'Test 3'], [6, 6, 'Test 4']], { group: true }),
      comp('Final exam', 40, [[null, 100]])],
    { official: { grade: 'HD', mark: 88 } }),
  ];
}
