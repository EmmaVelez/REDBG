import { useEffect, useRef, useState } from 'react';

/** How long the gauge takes to drain from the old Health to the new one. */
export const DAMAGE_COUNTDOWN_MS = 1400;
/** Tick rate of the drain. A TIMER, not requestAnimationFrame: rAF does not
 *  fire in a backgrounded tab, which would freeze the countdown entirely. */
export const DAMAGE_TICK_MS = 50;

/**
 * Detects that the given character took damage since the last render, and
 * ANIMATES the gauge from the old Health down to the new one.
 *
 * `animHp` is what the ring DISPLAYS: it starts at the previous Health and
 * counts down tick by tick. It used to be a single 4.9s timeout that jumped
 * straight to the new value at the end, so the gauge looked stuck.
 */
export function useDamageEffect(hp: number, maxHp: number, key = '') {
  // Seed with the CURRENT hp: starting at maxHp would read as a damage
  // drop on mount and play the countdown for a character already hurt.
  const prevRef = useRef<{ hp: number; maxHp: number }>({ hp, maxHp });
  const [flash, setFlash] = useState(false);
  const [animHp, setAnimHp] = useState(hp);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    // Record the CURRENT values unconditionally. Writing prevRef only in the
    // non-drop branch meant a damage event kept comparing against the same
    // stale HP on every render, re-firing the countdown (the gauge snapped back
    // to full and emptied again) until the timer happened to expire.
    prevRef.current = { hp, maxHp };

    if (hp >= prev.hp) {
      setAnimHp(hp);
      return;
    }

    setFlash(true);
    const from = prev.hp;
    const startedAt = performance.now();
    if (timerRef.current !== null) window.clearInterval(timerRef.current);

    const tick = (): void => {
      const t = Math.min(1, (performance.now() - startedAt) / DAMAGE_COUNTDOWN_MS);
      setAnimHp(Math.round(from + (hp - from) * t));
      if (t < 1) return;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setFlash(false);
      setAnimHp(hp);
    };
    timerRef.current = window.setInterval(tick, DAMAGE_TICK_MS);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [hp, maxHp, key]);

  return { flash, animHp, prevHp: prevRef.current.hp };
}
