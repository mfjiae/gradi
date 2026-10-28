// Short labels for the Need column and subject cards.
import { fmt, ceil1 } from './grades.js';

export const needShort = (r) => ({ secured: 'Secured', missed: 'Missed', out: 'Out of reach', empty: '—' }[r.state] || `${fmt(Math.max(0, ceil1(r.req)))}%`);
export const needColor = (r) => ({ secured: 'var(--hd)', missed: 'var(--warn)', out: 'var(--f)' }[r.state] || 'var(--accent)');
