import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { CardDef, GameState } from '@re/game-core';
import { diffCardMoves, type CardMove } from './anims';
import { defForInstance } from './cards';

/**
 * Card flight layer — animates cards moving between zones.
 *
 * On every new GameState it diffs against the previous one and spawns a
 * temporary "flying card" for each moved instance, animating from the source
 * zone's anchor rect to the destination's. Pure DOM work — no effect runs in
 * SSR contexts (renderToStaticMarkup), so server-side tests render nothing.
 */

type Flight = CardMove & { readonly key: string };

function zoneSelector(zone: CardMove['fromZone'], pileId: string | undefined): string {
  if (zone === 'market' && pileId !== undefined) return `[data-anim-zone="market-${pileId}"]`;
  return `[data-anim-zone="${zone}"]`;
}

function rectCenter(sel: string): { x: number; y: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(sel);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Imperative mini card face (no React reconciliation per frame). */
function buildFlightCard(def: CardDef | null): HTMLElement {
  const host = document.createElement('div');
  host.className = 'flight-card-inner';
  if (def === null) {
    host.classList.add('flight-face-down');
    const emblem = document.createElement('span');
    emblem.className = 'card-back-emblem';
    emblem.textContent = 'R.E.';
    host.appendChild(emblem);
    return host;
  }
  const name = document.createElement('div');
  name.className = 'flight-card-name';
  name.textContent = def.name;
  host.appendChild(name);
  const type = document.createElement('div');
  type.className = 'flight-card-type';
  type.textContent = def.type;
  host.appendChild(type);
  return host;
}

function flyCard(flight: Flight, state: GameState, done: () => void): void {
  const from = rectCenter(zoneSelector(flight.fromZone, flight.fromPileId));
  const to = rectCenter(zoneSelector(flight.toZone, flight.toPileId));
  if (from === null || to === null) {
    done();
    return;
  }
  const el = document.createElement('div');
  el.className = 'flight-card';
  el.style.left = '0px';
  el.style.top = '0px';
  el.appendChild(
    buildFlightCard(flight.faceDown ? null : defForInstance(state, flight.instanceId))
  );
  document.body.appendChild(el);
  const base = 96; // flight-card footprint (px)
  const start = { x: from.x - base / 2, y: from.y - base / 2 };
  const end = { x: to.x - base / 2, y: to.y - base / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  el.animate(
    [
      { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) rotate(180deg) scale(0.9)`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(360deg) scale(0.7)`, opacity: 0 },
    ],
    { duration: 550, easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)' }
  ).finished.then(() => {
    el.remove();
    done();
  });
}

export function CardFlightLayer({ state }: { state: GameState }): JSX.Element {
  const prevRef = useRef<GameState | null>(null);
  const batchRef = useRef<ReadonlySet<string>>(new Set());
  const [flights, setFlights] = useState<readonly Flight[]>([]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (prev === null || prev.version === state.version) {
      return;
    }
    if (typeof document === 'undefined') {
      return; // SSR test rendering — no DOM to animate
    }
    const moves = diffCardMoves(prev, state);
    // Drop any previous batch that never got to fly (superseded mid-burst).
    setFlights(prevFlights => prevFlights.filter(f => !batchRef.current.has(f.key)));
    if (moves.length === 0) {
      batchRef.current = new Set();
      return;
    }
    const after: Flight[] = moves.map((m, i) => ({
      ...m,
      key: `${state.version}-${m.instanceId}-${i}`,
    }));
    batchRef.current = new Set(after.map(f => f.key));
    setFlights(prevFlights => [...prevFlights, ...after]);
    const timers = after.map((flight, i) =>
      setTimeout(() => {
        flyCard(flight, state, () => {
          setFlights(prevFlights => prevFlights.filter(f => f.key !== flight.key));
        });
      }, i * 80)
    );
    // Fallback purge so a batch can never leak if a flight's animation is
    // interrupted (e.g. tab hidden). Runs after the longest flight + margin.
    const purge = setTimeout(() => {
      setFlights(prevFlights =>
        prevFlights.filter(f => !after.some(a => a.key === f.key))
      );
    }, 700 + after.length * 80 + 600);
    return () => {
      timers.forEach(t => clearTimeout(t));
      clearTimeout(purge);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // The layer itself renders nothing — the flight elements are appended to
  // document.body imperatively (cheaper than React reconciliation per frame).
  // `flights` state only exists to keep this component mounted/live.
  return <div className="card-flight-layer" data-flight-count={flights.length} />;
}