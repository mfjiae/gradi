// Small React hooks shared by the screens.
import { useEffect, useRef, useState } from 'react';

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
