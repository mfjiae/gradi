// Quick search (M8, option A: command palette). Ctrl+K anywhere, the sidebar Search button, or the magnifier on
// Home (phones, full screen). Arrow keys + Enter, Esc closes. The box closes after picking (App.jsx acts on it).
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildIndex, search, flat } from '../lib/search.js';
import { Icon } from './ui.jsx';
import { useNow } from './hooks.js';

const ICON = { subject: 'book', task: 'study', exam: 'calendar', link: 'link', contact: 'user', topic: 'topic' };
const GO = { subject: 'Open', task: 'Edit', exam: 'Open', link: 'Open ↗', contact: 'Show', topic: 'Show' };

function Hl({ text, q }) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return text;
  const low = text.toLowerCase();
  for (const w of words) {
    const i = low.indexOf(w);
    if (i >= 0) return <>{text.slice(0, i)}<mark>{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>;
  }
  return text;
}

export default function Search({ subjects, tasks, current, onPick, onClose }) {
  const now = useNow();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const box = useRef(null);
  const list = useRef(null);
  const index = useMemo(() => buildIndex({ subjects, tasks, current }), [subjects, tasks, current]);
  const groups = useMemo(() => search(index, q, { subjects, tasks, current, now }), [index, q, subjects, tasks, current, now]);
  const items = flat(groups);

  useEffect(() => {
    box.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => { list.current?.querySelector('.pal-i.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const pick = (x) => { if (x) onPick(x); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); } else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((n) => (items.length ? (n + 1) % items.length : 0)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((n) => (items.length ? (n - 1 + items.length) % items.length : 0)); } else if (e.key === 'Enter') { e.preventDefault(); pick(items[sel]); }
  };

  const starts = groups.map((g, gi) => groups.slice(0, gi).reduce((a, x) => a + x.items.length, 0));
  return (
    <div className="pal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Search">
        <div className="pal-in">
          <Icon name="search" />
          <input ref={box} value={q} placeholder="Search subjects, tasks, links, topics" aria-label="Search" autoComplete="off" spellCheck={false}
            role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={items[sel] ? `pal-${sel}` : undefined}
            onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey} />
          <button type="button" className="btn sm ghost" onClick={onClose} aria-label="Close search">Esc</button>
        </div>
        <div className="pal-res" id="pal-list" role="listbox" ref={list}>
          {!items.length && <div className="pal-none">{q.trim() ? `Nothing matches "${q.trim()}". Try a subject code, a task, or a link name.` : 'No subjects in this session yet.'}</div>}
          {groups.map((g, gi) => (
            <div key={g.kind + g.label} role="group" aria-label={g.label}>
              <div className="pal-g">{g.label}</div>
              {g.items.map((x, xi) => {
                const n = starts[gi] + xi;
                return (
                  <button type="button" key={x.kind + x.id} id={`pal-${n}`} role="option" aria-selected={n === sel}
                    className={`pal-i ${n === sel ? 'sel' : ''} ${x.done ? 'done' : ''}`}
                    onMouseMove={() => { if (sel !== n) setSel(n); }} onClick={() => pick(x)}>
                    <span className="ico"><Icon name={ICON[x.kind]} /></span>
                    <span className="t"><span><Hl text={x.title} q={q} /></span>{x.sub && <small>{x.sub}</small>}</span>
                    <span className="go">{GO[x.kind]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pal-foot"><span>↑ ↓ move</span><span>Enter open</span><span>Esc close</span></div>
      </div>
    </div>
  );
}
