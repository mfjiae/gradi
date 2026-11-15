// Subject hub and quick search tests (M8). Fake subjects only: real grades never go in this public repo.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import * as H from '../hub.js';
import { buildIndex, search, flat } from '../search.js';
import { mergeSnapshots } from '../merge.js';
import { planRestore } from '../backup.js';
import { planImport, parseImport } from '../importText.js';
import { exportSheets } from '../exportData.js';
import * as E from '../edit.js';
import { db } from '../db.js';
import * as store from '../store.js';

const CUR = { year: 2026, session: 'Spring' };
const NOW = { date: '2026-11-15', time: '20:00' };
const subj = (o = {}) => ({ uid: o.uid ?? `u${Math.random()}`, code: 'SAMPLE_A', name: 'Sample Circuits', year: 2026, session: 'Spring', cp: 6, target: 85, components: [], official: null, countsGpa: true, countsWam: true, ...o });

describe('hub edits', () => {
  it('gives old subjects an empty hub and never changes the original', () => {
    const s = subj();
    expect(H.getHub(s)).toEqual({ links: [], contacts: [], topics: [], notes: '', exam: { room: '', allowed: '' } });
    const t = H.addTopic(s, 'Op-amps');
    expect(s.hub).toBeUndefined();
    expect(H.getHub(t).topics).toMatchObject([{ name: 'Op-amps', done: false }]);
  });

  it('adds, edits, ticks and removes links, contacts and topics', () => {
    let s = subj();
    s = H.addLink(s, { name: 'Canvas', url: 'canvas.uts.edu.au/courses/1' });
    s = H.addLink(s, { name: '', url: 'https://www.drive.example/f' });
    s = H.addContact(s, { name: 'Dr Sample', role: 'Coordinator', reach: 'a@uts.example' });
    s = H.addTopic(s, 'Phasors');
    s = H.addTopic(s, '   '); // blank: ignored
    let h = H.getHub(s);
    expect(h.links.map((l) => [l.name, l.url])).toEqual([['Canvas', 'https://canvas.uts.edu.au/courses/1'], ['drive.example', 'https://www.drive.example/f']]);
    expect(h.topics).toHaveLength(1);
    s = H.toggleTopic(s, h.topics[0].id);
    s = H.renameTopic(s, h.topics[0].id, 'AC phasors');
    s = H.updateLink(s, h.links[0].id, { name: 'Canvas page' });
    s = H.updateContact(s, h.contacts[0].id, { role: 'Tutor' });
    s = H.removeItem(s, 'link', h.links[1].id);
    h = H.getHub(s);
    expect(h.topics[0]).toMatchObject({ name: 'AC phasors', done: true });
    expect(h.links.map((l) => l.name)).toEqual(['Canvas page']);
    expect(h.contacts[0].role).toBe('Tutor');
  });

  it('refuses unsafe addresses and works out how to reach a contact', () => {
    expect(H.cleanUrl('javascript:alert(1)')).toBe('');
    expect(H.cleanUrl('data:text/html,x')).toBe('');
    expect(H.cleanUrl('localhost:5173/x')).toBe('https://localhost:5173/x');
    expect(H.cleanUrl('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(H.addLink(subj(), { name: 'x', url: 'javascript:alert(1)' }).hub).toBeUndefined();
    expect(H.reachLink('a.b@uts.example')).toEqual({ href: 'mailto:a.b@uts.example', label: 'Email' });
    expect(H.reachLink('+61 2 9514 0000')).toEqual({ href: 'tel:+61295140000', label: 'Call' });
    expect(H.reachLink('Canvas inbox')).toBeNull();
  });

  it('keeps notes and exam info', () => {
    let s = H.setNotes(subj(), 'Ask about the formula sheet\n\n');
    s = H.setExamInfo(s, { room: ' CB11.00.405 ', allowed: 'Calculator' });
    expect(H.getHub(s)).toMatchObject({ notes: 'Ask about the formula sheet', exam: { room: 'CB11.00.405', allowed: 'Calculator' } });
  });

  it('finds the next exam from study tasks (by name or linked to an exam)', () => {
    const s = subj({ uid: 'S1', components: [{ id: 'c1', name: 'Final exam', weight: 60, single: true, items: [{ id: 'i1', name: 'Mark', score: null, max: 100 }] }] });
    const tasks = [
      { uid: 't1', subjectUid: 'S1', title: 'Lab report', status: 'open', due: '2026-11-17' },
      { uid: 't2', subjectUid: 'S1', title: 'Revise', status: 'open', due: '2026-11-27', time: '09:00', link: { cid: 'c1', iid: 'i1' } },
      { uid: 't3', subjectUid: 'S1', title: 'Midsession exam', status: 'open', due: '2026-11-10' }, // past
      { uid: 't4', subjectUid: 'S2', title: 'Exam', status: 'open', due: '2026-11-20' }, // other subject
    ];
    expect(H.nextExam(s, tasks, NOW)).toMatchObject({ task: { uid: 't2' }, days: 12 });
    expect(H.nextExam(s, tasks.slice(0, 1), NOW)).toBeNull();
  });
});

describe('hub travels with the subject', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('syncs and restores as part of the subject (newest edit wins)', () => {
    const a = { ...H.addTopic(subj({ uid: 'X' }), 'Old'), updatedAt: 1 };
    const b = { ...H.setNotes(subj({ uid: 'X' }), 'newer'), updatedAt: 2 };
    const m = mergeSnapshots({ subjects: [a] }, { subjects: [b] });
    expect(H.getHub(m.subjects[0])).toMatchObject({ notes: 'newer', topics: [] });
    const plan = planRestore({ subjects: [] }, { subjects: [a] }, 'merge');
    expect(H.getHub(plan.subjects[0]).topics[0].name).toBe('Old');
  });

  it('keeps the hub when Import from text updates the subject, and through other edits', async () => {
    const s = await store.putSubject(H.addLink(subj(), { name: 'Canvas', url: 'canvas.example' }));
    await store.updateSubject(s.uid, (x) => E.setTarget(x, 75));
    const [p] = planImport(parseImport('SAMPLE_A: Sample Circuits | Spring 2026\nExam | 100% | 50/100').blocks, [await db.subjects.get(s.uid)]);
    expect(p.status).toBe('update');
    expect(H.getHub(p.subject).links[0].name).toBe('Canvas');
    await store.importSubjects([p.subject]);
    const saved = await db.subjects.get(s.uid);
    expect(saved.target).toBe(75);
    expect(H.getHub(saved).links[0].url).toBe('https://canvas.example');
  });

  it('exports a Hub sheet', () => {
    let s = H.addLink(subj(), { name: 'Canvas', url: 'canvas.example' });
    s = H.addTopic(H.setNotes(s, 'note'), 'Op-amps');
    const hub = exportSheets({ subjects: [s], tasks: [], current: CUR }).find((x) => x.name === 'Hub');
    expect(hub.rows.map((r) => r[3])).toEqual(['Link', 'Revision topic', 'Notes']);
  });
});

describe('quick search', () => {
  let a = subj({ uid: 'A', code: 'SAMPLE_A', name: 'Sample Circuits' });
  a = H.addLink(a, { name: 'Canvas page', url: 'canvas.uts.example' });
  a = H.addContact(a, { name: 'J. Example', role: 'Tutor, lab Thu', reach: 'j@uts.example' });
  a = H.addTopic(a, 'Lab safety');
  a = H.setExamInfo(a, { room: 'CB11.00.405' });
  const b = subj({ uid: 'B', code: 'SAMPLE_B', name: 'Sample Signals', year: 2027, session: 'Autumn' });
  const old = subj({ uid: 'C', code: 'SAMPLE_C', name: 'Old Maths', year: 2025, session: 'Autumn', official: { grade: 'D', mark: 80 } });
  const subjects = [a, b, old];
  const tasks = [
    { uid: 't1', subjectUid: 'A', title: 'Lab report 2', status: 'open', due: '2026-11-17' },
    { uid: 't2', subjectUid: 'A', title: 'Book lab slot', status: 'done', due: '2026-11-01' },
    { uid: 't3', subjectUid: 'B', title: 'Read chapter', status: 'open', due: null },
  ];
  const idx = buildIndex({ subjects, tasks, current: CUR });
  const run = (q) => search(idx, q, { subjects, tasks, current: CUR, now: NOW });

  it('finds subjects, tasks, links, contacts, topics and the exam, grouped', () => {
    const g = run('lab');
    expect(g.map((x) => x.kind)).toEqual(['task', 'contact', 'topic']);
    expect(g[0].items.map((x) => x.id)).toEqual(['t1', 't2']); // open before done
    expect(flat(run('canvas'))[0]).toMatchObject({ kind: 'link', url: 'https://canvas.uts.example', subjectUid: 'A' });
    expect(flat(run('cb11'))[0]).toMatchObject({ kind: 'exam', subjectUid: 'A' });
    expect(flat(run('signals'))[0]).toMatchObject({ kind: 'subject', id: 'B', sub: 'Autumn 2027 · planned' });
  });

  it('needs every word, any case, and finds things by subject code', () => {
    expect(flat(run('REPORT lab')).map((x) => x.id)).toEqual(['t1']);
    expect(flat(run('sample_b')).map((x) => x.id)).toEqual(['B', 't3']);
    expect(run('zzz')).toEqual([]);
  });

  it('shows this session\'s subjects and what is due soon when empty', () => {
    const g = run('  ');
    expect(g.map((x) => [x.label, x.items.map((i) => i.id)])).toEqual([['This session', ['A']], ['Due soon', ['t1']]]);
  });
});

describe('quick edits in a row', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  it('keeps every one (no edit overwrites another)', async () => {
    const s = await store.putSubject(subj());
    await Promise.all(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t) => store.updateSubject(s.uid, (x) => H.addTopic(x, t))));
    expect(H.getHub(await db.subjects.get(s.uid)).topics.map((t) => t.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });
});
