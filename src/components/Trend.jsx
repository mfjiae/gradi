// Home "Trend" card (option A, locked 1 Nov 2026): running GPA or WAM after each session, oldest first.
// Solid line = official results. The current session, while unfinished, is a dashed line to a hollow dot
// ("if you stay on track", from marks so far). The y-axis is zoomed to the data so small moves are visible.
import { useEffect, useRef, useState } from 'react';
import { sessionTrend, sessionShort, fmt, sessionName } from '../lib/grades.js';
import { useLocalPref } from './hooks.js';

const METRICS = {
  gpa: { label: 'GPA', key: 'gpa', step: 0.25, lo: 0, hi: 7, f: (v) => fmt(v, 2), tick: (v) => fmt(v, 2).replace(/\.?0+$/, '') },
  wam: { label: 'WAM', key: 'avg', step: 2, lo: 0, hi: 100, f: (v) => fmt(v), tick: (v) => fmt(v, 0) },
};

// Width of the card body, so the chart is drawn at its real size (text never stretches).
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Chart({ pts, m, w }) {
  const h = w < 420 ? 170 : 200;
  const vals = pts.map((p) => p[m.key]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const lo = Math.max(m.lo, Math.floor((min - m.step) / m.step) * m.step);
  const hi = Math.min(m.hi, Math.ceil((max + m.step) / m.step) * m.step);
  const ticks = [lo, (lo + hi) / 2, hi];
  const l = 38, r = 18, t = 24, b = 24;
  const n = pts.length;
  const X = (i) => (n === 1 ? (l + w - r) / 2 : l + (i * (w - l - r)) / (n - 1));
  const Y = (v) => t + ((hi - v) / (hi - lo || 1)) * (h - t - b);
  const gap = n > 1 ? (w - l - r) / (n - 1) : w;
  const showLabel = (i) => gap >= 44 || i === 0 || i === n - 1 || (gap >= 24 && i % 2 === 0);
  const real = pts.filter((p) => !p.proj);
  const last = pts.at(-1);
  const summary = pts.map((p) => `${sessionName(p)} ${m.f(p[m.key])}${p.proj ? ' (on track)' : ''}`).join(', ');
  return (
    <svg className="trend-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Running ${m.label} by session: ${summary}`}>
      {ticks.map((k) => (
        <g key={k}>
          <line x1={l} x2={w - r} y1={Y(k)} y2={Y(k)} className="trend-grid" />
          <text x={l - 7} y={Y(k) + 4} textAnchor="end" className="trend-tick">{m.tick(k)}</text>
        </g>
      ))}
      {real.length > 1 && (
        <polyline className="trend-line" points={real.map((p) => `${X(pts.indexOf(p))},${Y(p[m.key])}`).join(' ')} />
      )}
      {last.proj && n > 1 && (
        <line className="trend-line dash" x1={X(n - 2)} y1={Y(pts[n - 2][m.key])} x2={X(n - 1)} y2={Y(last[m.key])} />
      )}
      {pts.map((p, i) => (
        <g key={p.key}>
          <circle cx={X(i)} cy={Y(p[m.key])} r="5" className={`trend-dot ${p.proj ? 'proj' : ''}`} />
          {showLabel(i) && <text x={X(i)} y={Y(p[m.key]) - 11} textAnchor="middle" className="trend-val">{m.f(p[m.key])}</text>}
          {showLabel(i) && <text x={X(i)} y={h - 6} textAnchor="middle" className="trend-tick">{sessionShort(p)}</text>}
        </g>
      ))}
    </svg>
  );
}

export default function TrendCard({ subjects, current }) {
  const [metric, setMetric] = useLocalPref('trendMetric', 'gpa');
  const m = METRICS[metric] || METRICS.gpa;
  const [ref, w] = useWidth();
  const pts = sessionTrend(subjects, current).filter((p) => p[m.key] != null);
  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Trend</h3>
        <div className="chips" role="group" aria-label="Show">
          {Object.entries(METRICS).map(([k, x]) => (
            <button key={k} type="button" className={`chip ${metric === k ? 'on' : ''}`} aria-pressed={metric === k} onClick={() => setMetric(k)}>{x.label}</button>
          ))}
        </div>
      </div>
      <div ref={ref} className="trend-body">
        {pts.length === 0 ? (
          <div className="note">Shows once a subject has {metric === 'gpa' ? 'a result' : 'a mark'}.</div>
        ) : w > 0 && <Chart pts={pts} m={m} w={w} />}
      </div>
      {pts.at(-1)?.proj && <div className="note">Dashed = {sessionShort(pts.at(-1))} if you stay on track</div>}
    </div>
  );
}
