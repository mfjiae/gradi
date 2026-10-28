// Add subject / Edit details. Same form as the prototype's Add subject; editing also sets the official result.
import { useEffect, useRef, useState } from 'react';
import { SESSIONS, OFFICIAL_GRADES, DEFAULT_CP, DEFAULT_TARGET } from '../lib/grades.js';

const GRADE_LABEL = { HD: 'HD', D: 'D', C: 'C', P: 'P', F: 'F', PASS: 'Pass, not graded' };

export default function SubjectForm({ subject, current, onSave, onClose }) {
  const editing = !!subject;
  const [f, setF] = useState(() => ({
    code: subject?.code ?? '',
    name: subject?.name ?? '',
    year: String(subject?.year ?? current.year),
    session: subject?.session ?? current.session,
    cp: String(subject?.cp ?? DEFAULT_CP),
    target: String(subject?.target ?? DEFAULT_TARGET),
    grade: subject?.official?.grade ?? '',
    mark: subject?.official?.mark == null ? '' : String(subject.official.mark),
  }));
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const out = { code: f.code, name: f.name, year: f.year, session: f.session, cp: f.cp, target: f.target };
    if (editing) out.official = { grade: f.grade, mark: f.mark };
    onSave(out);
  };
  return (
    <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit subject' : 'Add subject'} onSubmit={submit}>
        <h3 className="card-title">{editing ? 'Edit subject' : 'Add subject'}</h3>
        <label>Subject code<input ref={first} className="in" value={f.code} onChange={set('code')} placeholder="e.g. 48531_EA" /></label>
        <label>Name (optional)<input className="in" value={f.name} onChange={set('name')} /></label>
        <div className="grid g2">
          <label>Year<input className="in" inputMode="decimal" value={f.year} onChange={set('year')} /></label>
          <label>Session<select className="in" value={f.session} onChange={set('session')}>{SESSIONS.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        <div className="grid g2">
          <label>Credit points<input className="in" inputMode="decimal" value={f.cp} onChange={set('cp')} /></label>
          <label>Target mark<input className="in" inputMode="decimal" value={f.target} onChange={set('target')} /></label>
        </div>
        {editing && (
          <div className="grid g2">
            <label>Official result
              <select className="in" value={f.grade} onChange={set('grade')}>
                <option value="">None yet</option>
                {OFFICIAL_GRADES.map((g) => <option key={g} value={g}>{GRADE_LABEL[g]}</option>)}
              </select>
            </label>
            <label>Official mark<input className="in" inputMode="decimal" value={f.grade === 'PASS' ? '' : f.mark} disabled={!f.grade || f.grade === 'PASS'} placeholder={f.grade ? 'optional' : ''} onChange={set('mark')} /></label>
          </div>
        )}
        <div className="add-row">
          <button type="submit" className="btn primary">{editing ? 'Save' : 'Add subject'}</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
