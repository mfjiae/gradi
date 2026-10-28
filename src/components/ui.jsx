// Shared UI pieces: icons, grade pill, ladder bar, inputs that save when you leave them, tap-again buttons.
import { useEffect, useRef, useState } from 'react';
import { fmt } from '../lib/grades.js';

const PATHS = {
  home: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  book: <path d="M4 4h12a4 4 0 014 4v12H8a4 4 0 01-4-4zM4 16a4 4 0 014-4h12" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
};
export const Icon = ({ name }) => (
  <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{PATHS[name]}</svg>
);

export const Pill = ({ band }) => (band
  ? <span className="pill" style={{ '--bc': `var(${band.c})` }}>{band.k}</span>
  : <span className="note">—</span>);

// The ladder: banked marks, what can still be won, your target tick and the band thresholds.
export function Ladder({ r, proj = false, legend = false }) {
  const banked = Math.min(100, Math.max(0, r.banked));
  const showProj = proj && r.proj != null;
  return (
    <div className="ladder">
      <div className="lad-track" role="img" aria-label={`Banked ${fmt(r.banked)} of 100, target ${fmt(r.T)}${showProj ? `, what-if ${fmt(r.proj)}` : ''}`}>
        <i className="lad-banked" style={{ width: `${banked}%` }} />
        <i className="lad-pot" style={{ left: `${banked}%`, width: `${Math.max(0, 100 - banked)}%` }} />
        {showProj && <i className="lad-proj" style={{ left: `${Math.min(100, Math.max(0, r.proj))}%` }} />}
        <i className="lad-target" style={{ left: `${Math.min(100, r.T)}%` }} />
      </div>
      <div className="lad-scale">
        {[[50, 'P'], [65, 'C'], [75, 'D'], [85, 'HD']].map(([v, k]) => <span key={k} style={{ left: `${v}%` }}>{k} {v}</span>)}
      </div>
      {legend && (
        <div className="lad-legend">
          <span><i style={{ background: 'var(--accent)' }} />Banked {fmt(r.banked)}</span>
          <span><i style={{ background: 'repeating-linear-gradient(135deg,#5b5552 0 3px,transparent 3px 7px)' }} />Still available {fmt(r.remaining)}</span>
          <span><i style={{ background: '#fff' }} />Target {fmt(r.T)}</span>
          {showProj && <span><i style={{ background: 'var(--review)' }} />What-if {fmt(r.proj)}</span>}
        </div>
      )}
    </div>
  );
}

// A text or number box that saves when you leave it (or press Enter), so the numbers don't jump while typing.
export function Field({ value, onCommit, numeric = false, className = '', ...rest }) {
  const shown = value == null ? '' : String(value);
  const [text, setText] = useState(shown);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(shown); }, [shown]);
  const commit = () => { if (text !== shown) onCommit(text); };
  return (
    <input
      className={`in ${className}`}
      inputMode={numeric ? 'decimal' : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      {...rest}
    />
  );
}

// A table row you can click or reach with the keyboard.
export function Row({ className = '', onOpen, children }) {
  return (
    <div className={`tr row ${className}`} role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      {children}
    </div>
  );
}
