// Small React hooks shared by the screens.
import { useEffect, useRef, useState } from 'react';
import { sydneyNow } from '../lib/tasks.js';

// The Sydney date and time, refreshed every minute so "Overdue" and "Today" stay right while the app is open.
export function useNow() {
  const [now, setNow] = useState(() => sydneyNow());
  useEffect(() => {
    const id = setInterval(() => {
      const n = sydneyNow();
      setNow((p) => (p.date === n.date && p.time === n.time ? p : n));
    }, 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const PHONE = '(max-width: 899px)';
export function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches);
  useEffect(() => {
    const m = window.matchMedia?.(PHONE);
    if (!m) return undefined;
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

// "Tap again to delete": the first tap arms the button for 3 seconds.
export function useArm() {
  const [armed, setArmed] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    armed,
    tap(key, fn) {
      clearTimeout(timer.current);
      if (armed === key) { setArmed(null); fn(); return; }
      setArmed(key);
      timer.current = setTimeout(() => setArmed(null), 3000);
    },
  };
}

// Per-device view choices (Past sessions shown, Subjects scope). Browser storage may be unavailable; that's fine.
export function useLocalPref(key, initial) {
  const [v, setV] = useState(() => {
    try { const raw = localStorage.getItem(`gradi.${key}`); return raw == null ? initial : JSON.parse(raw); } catch { return initial; }
  });
  const set = (next) => { setV(next); try { localStorage.setItem(`gradi.${key}`, JSON.stringify(next)); } catch { /* ignore */ } };
  return [v, set];
}
