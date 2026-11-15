// Export to Excel tests (M7). Fake subjects only.
import { describe, it, expect } from 'vitest';
import { exportSheets, buildExport, exportFileName } from '../exportData.js';
import { makeXlsx, colName, sheetNames, crc32 } from '../xlsx.js';
import { sampleSubjects } from '../sample.js';

const CUR = { year: 2026, session: 'Spring' };
const dec = new TextDecoder();

// Reads a stored (uncompressed) zip back into { name: text }.
function unzip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let at = 0;
  while (v.getUint32(at, true) === 0x04034b50) {
    const size = v.getUint32(at + 18, true);
    const nlen = v.getUint16(at + 26, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nlen));
    const data = bytes.subarray(at + 30 + nlen, at + 30 + nlen + size);
    expect(crc32(data)).toBe(v.getUint32(at + 14, true));
    out[name] = dec.decode(data);
    at += 30 + nlen + size;
  }
  return out;
}

describe('xlsx writer', () => {
  it('names columns and sheets the way Excel needs', () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(sheetNames(['Plan', 'plan', 'a/b?', 'x'.repeat(40)])).toEqual(['Plan', 'plan 2', 'a b', 'x'.repeat(31)]);
  });
  it('checks crc32 against a known value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes a valid zip with the workbook, styles and one sheet per tab', () => {
    const files = unzip(makeXlsx([{ name: 'A & B', header: ['Name', 'Mark'], rows: [['<x>', 88.5], [null, 0], [true, '']] }]));
    expect(Object.keys(files)).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
    expect(files['xl/workbook.xml']).toContain('name="A &amp; B"');
    const sh = files['xl/worksheets/sheet1.xml'];
    expect(sh).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name</t></is></c>');
    expect(sh).toContain('<c r="B2"><v>88.5</v></c>');
    expect(sh).toContain('&lt;x&gt;');
    expect(sh).toContain('<c r="B3"><v>0</v></c>');
    expect(sh).not.toContain('r="A3"'); // empty cells are left out
    expect(sh).toContain('<t>Yes</t>');
    expect(sh).toContain('state="frozen"');
  });
});

describe('export sheets', () => {
  const subjects = sampleSubjects(CUR);
  const motors = subjects.find((s) => s.code === 'SAMPLE_A');
  const future = { ...motors, uid: 'fut', code: 'SAMPLE_Z', year: 2027, session: 'Autumn', components: [], enrolled: true, countsDegree: false };
  const tasks = [
    { uid: 't1', title: 'Report', subjectUid: motors.uid, status: 'progress', important: true, due: '2026-11-20', time: '23:59', repeat: null, remind: 2, details: 'draft', doneAt: null },
    { uid: 't2', title: 'Old', subjectUid: 'gone', status: 'done', important: false, due: null, time: null, repeat: 'weekly', remind: null, details: '', doneAt: Date.UTC(2026, 9, 1, 3) },
  ];
  const sheets = exportSheets({ subjects: [...subjects, future], tasks, current: CUR, degreeTotal: 198 });
  const get = (name) => sheets.find((s) => s.name === name);
  it('has the four agreed sheets', () => {
    expect(sheets.map((s) => s.name)).toEqual(['Subjects', 'Assessments', 'Tasks', 'Plan', 'Hub']);
    for (const s of sheets) for (const r of s.rows) expect(r.length <= s.header.length).toBe(true);
  });
  it('lists subjects oldest session first with plain-number marks', () => {
    const rows = get('Subjects').rows;
    expect(rows).toHaveLength(9);
    expect(rows[0][2]).toBeLessThanOrEqual(rows[8][2]);
    const digital = rows.find((r) => r[0] === 'SAMPLE_D');
    expect(digital.slice(5, 9)).toEqual(['Done', 'HD', 94, 7]);
    const pass = rows.find((r) => r[0] === 'SAMPLE_F');
    expect(pass[6]).toBe('Pass, not graded');
    expect(pass[8]).toBeNull();
    const m = rows.find((r) => r[0] === 'SAMPLE_A');
    expect(m[5]).toBe('In progress');
    expect(m[6]).toMatch(/so far$/);
    expect(typeof m[9]).toBe('number');
    const z = rows.find((r) => r[0] === 'SAMPLE_Z');
    expect([z[5], z[13]]).toEqual(['Enrolled', 'No']);
  });
  it('lists every part with its score, out of and percent', () => {
    const rows = get('Assessments').rows.filter((r) => r[0] === 'SAMPLE_A');
    const lab1 = rows.find((r) => r[7] === 'Lab 1');
    expect(lab1.slice(3, 12)).toEqual(['Labs', 20, null, null, 'Lab 1', 9, 10, 90, 'Yes']);
    const exam = rows.find((r) => r[3] === 'Final exam');
    expect([exam[5], exam[7], exam[8], exam[10]]).toEqual([40, '', null, null]);
  });
  it('lists tasks by due date with the subject code', () => {
    const rows = get('Tasks').rows;
    expect(rows[0]).toEqual(['SAMPLE_A', 'Report', 'In progress', '2026-11-20', '23:59', 'Yes', '', '2 days before', 'draft', '']);
    expect(rows[1]).toEqual(['', 'Old', 'Done', '', '', '', 'Every week', '', '', '2026-10-01']);
  });
  it('ends the plan with the degree totals', () => {
    const rows = get('Plan').rows;
    const tot = Object.fromEntries(rows.filter((r) => r.length === 5).map((r) => [r[0], r[4]]));
    expect(tot['Degree total']).toBe(198);
    expect(tot['Done']).toBe(6 + 6 + 3 + 6 + 6); // samples D, E, F (3 cp pass), G, H
    expect(tot['This session']).toBe(18);
    expect(tot['Planned']).toBe(0);
  });
  it('builds the file and names it by the Sydney date', () => {
    const bytes = buildExport({ subjects, tasks, current: CUR });
    expect(bytes[0]).toBe(0x50);
    expect(Object.keys(unzip(bytes))).toContain('xl/worksheets/sheet4.xml');
    expect(exportFileName(new Date(Date.UTC(2026, 10, 15, 14)))).toBe('gradi-export-2026-11-16.xlsx');
  });
});
