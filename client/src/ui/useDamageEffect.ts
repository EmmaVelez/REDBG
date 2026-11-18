import { useEffect, useRef, useState } from 'react';

/** Detects that the given character took damage since the last render. */
export function useDamageEffect(hp: number, maxHp: number, key = '') {
  // Seed with the CURRENT hp: starting at maxHp would read as a damage
  // drop on mount and play the countdown for a character already hurt.
  const prevRef = useRef<{ hp: number; maxHp: number }>({ hp, maxHp });
  const [flash, setFlash] = useState(false);
  const [animHp, setAnimHp] = useState(hp);

  useEffect(() => {
    const prev = prevRef.current;
    // Record the CURRENT values unconditionally. Writing prevRef only in the
    // non-drop branch meant a damage event kept comparing against the same
    // stale HP on every render, re-firing the countdown (the gauge snapped back
    // to full and emptied again) until the timer happened to expire.
    prevRef.current = { hp, maxHp };
    const dropped = hp < prev.hp;
    if (!dropped) return;
    setFlash(true);
    setAnimHp(prev.hp); // start from old value for countdown
    const tid = window.setTimeout(() => {
      setFlash(false);
      setAnimHp(hp);
    }, 4900);
    return () => window.clearTimeout(tid);
  }, [hp, maxHp, key]);

  return { flash, animHp, prevHp: prevRef.current.hp };
}
