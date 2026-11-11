import { useEffect, useRef, useState } from 'react';

/** Detects that the given character took damage since the last render. */
export function useDamageEffect(hp: number, maxHp: number, key = '') {
  const prevRef = useRef<{ hp: number; maxHp: number }>({ hp: maxHp, maxHp });
  const [flash, setFlash] = useState(false);
  const [animHp, setAnimHp] = useState(hp);

  useEffect(() => {
    const prev = prevRef.current;
    const dropped = hp < prev.hp || (maxHp !== prev.maxHp && maxHp < prev.maxHp);
    if (dropped && hp <= prev.hp) {
      setFlash(true);
      setAnimHp(prev.hp); // start from old value for countdown
      const tid = window.setTimeout(() => {
        setFlash(false);
        setAnimHp(hp);
      }, 800);
      return () => window.clearTimeout(tid);
    }
    prevRef.current = { hp, maxHp };
  }, [hp, maxHp, key]);

  return { flash, animHp, prevHp: prevRef.current.hp };
}
