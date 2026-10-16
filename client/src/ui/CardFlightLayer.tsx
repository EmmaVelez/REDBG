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

/**
 * Straight-line flight geometry: the flying card is placed AT the source
 * rect (fixed position) and translated by (dx, dy) to the destination, so it
 * never passes through the viewport origin.
 */
export interface FlightPath {
  readonly from: { x: number; y: number };
  readonly dx: number;
  readonly dy: number;
}

export function flightPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  base = 96
): FlightPath {
  const start = { x: from.x - base / 2, y: from.y - base / 2 };
  const end = { x: to.x - base / 2, y: to.y - base / 2 };
  return { from: start, dx: end.x - start.x, dy: end.y - start.y };
}

/** True when the rect is at least partially inside the viewport. */
function visible(sel: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(sel);
  if (el === null) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < (window.innerHeight ?? 0) && r.right > 0 && r.left < (window.innerWidth ?? 0);
}

const FLIGHT_MS = 665; // per-card travel time (linear)
const STAGGER_MS = 80; // gap between flights in the same batch
const PHASE_GAP_MS = 180; // beat between reshuffle and draw phases

function flyCard(flight: Flight, state: GameState): Promise<void> {
  return new Promise(resolve => {
    const from = rectCenter(zoneSelector(flight.fromZone, flight.fromPileId));
    const to = rectCenter(zoneSelector(flight.toZone, flight.toPileId));
    if (from === null || to === null) {
      resolve();
      return;
    }
    // Skip flights whose source or destination is off-screen — the card would
    // travel through the viewport edge for no benefit.
    if (!visible(zoneSelector(flight.fromZone, flight.fromPileId)) || !visible(zoneSelector(flight.toZone, flight.toPileId))) {
      resolve();
      return;
    }
    const el = document.createElement('div');
    el.className = 'flight-card';
    const path = flightPath(from, to);
    el.style.left = `${path.from.x}px`;
    el.style.top = `${path.from.y}px`;
    el.appendChild(
      buildFlightCard(flight.faceDown ? null : defForInstance(state, flight.instanceId))
    );
    document.body.appendChild(el);
    // Linear travel: straight translate from the source position to the target.
    el.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${path.dx}px, ${path.dy}px) rotate(0deg) scale(0.75)`, opacity: 0 },
      ],
      { duration: FLIGHT_MS, easing: 'linear' }
    ).finished.then(() => {
      el.remove();
      resolve();
    });
  });
}

/** Wait for the longest flight in a staggered batch to land. */
function batchDuration(count: number): number {
  return count === 0 ? 0 : (count - 1) * STAGGER_MS + FLIGHT_MS;
}

/** True when a move is the reshuffle of the discard pile back into the deck. */
function isReshuffle(move: CardMove): boolean {
  return move.fromZone === 'discard' && move.toZone === 'deck';
}

/**
 * Order moves for playback: the reshuffle phase (discard -> deck) comes
 * FIRST, everything else (usually draws) second. The draw flights only start
 * after the reshuffle has landed.
 */
export function splitFlightPhases(
  moves: readonly CardMove[]
): { readonly reshuffle: readonly CardMove[]; readonly rest: readonly CardMove[] } {
  const reshuffle = moves.filter(isReshuffle);
  const rest = moves.filter(m => !isReshuffle(m));
  return { reshuffle, rest };
}

export function CardFlightLayer({ state }: { state: GameState }): JSX.Element {
  const prevRef = useRef<GameState | null>(null);
  const batchRef = useRef<ReadonlySet<string>>(new Set());
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (prev === null || prev.version === state.version) {
      return;
    }
    if (typeof document === 'undefined') {
      return; // SSR test rendering — no DOM to animate
    }
    // Cap generously (16): a reshuffle (discard -> deck) plus a 5-card draw
    // both fly in this transition; the default 10 could truncate the pile.
    const moves = diffCardMoves(prev, state, 16);
    // Drop any previous batch that never got to fly (superseded mid-burst).
    setFlights(prevFlights => prevFlights.filter(f => !batchRef.current.has(f.key)));
    if (moves.length === 0) {
      batchRef.current = new Set();
      return;
    }

    // Phase 1: reshuffle (discard flies back into the deck). Phase 2: the rest
    // (usually draws). The draw flights never start until the reshuffle has
    // finished landing, so the player sees the pile rebuild first.
    const { reshuffle, rest } = splitFlightPhases(moves);

    const all: readonly (readonly CardMove[])[] = reshuffle.length > 0 ? [reshuffle, rest] : [rest];
    const allFlattened: Flight[] = [];
    let stamp = 0;
    const keyed: Flight[][] = all.map(group =>
      group.map((m, i) => {
        const flight: Flight = { ...m, key: `${state.version}-${stamp++}-${i}` };
        allFlattened.push(flight);
        return flight;
      })
    );
    batchRef.current = new Set(allFlattened.map(f => f.key));
    setFlights(prevFlights => [...prevFlights, ...allFlattened]);

    cancelledRef.current = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    // Play the phases in order; each flight in a phase is staggered, and the
    // next phase waits for this phase's longest flight plus a beat.
    const playPhases = async (): Promise<void> => {
      for (const group of keyed) {
        if (cancelledRef.current) break;
        if (group.length === 0) continue;
        group.forEach((flight, i) => {
          timers.push(
            setTimeout(() => {
              if (cancelledRef.current) return;
              void flyCard(flight, state).then(() => {
                setFlights(prevFlights => prevFlights.filter(f => f.key !== flight.key));
              });
            }, i * STAGGER_MS)
          );
        });
        // Wait for this phase's longest flight + the inter-phase beat before
        // scheduling the next phase (draws only start once the reshuffle
        // has landed).
        const waitFor = Date.now() + batchDuration(group.length) + PHASE_GAP_MS;
        while (!cancelledRef.current && Date.now() < waitFor) {
          await new Promise(r => setTimeout(r, 50));
        }
      }
    };
    void playPhases();

    // Fallback purge so a batch can never leak if flights are interrupted.
    const total = keyed.reduce((sum, g) => sum + batchDuration(g.length), 0) + PHASE_GAP_MS * (keyed.length - 1);
    const purge = setTimeout(() => {
      setFlights(prevFlights =>
        prevFlights.filter(f => !allFlattened.some(a => a.key === f.key))
      );
    }, total + 800);
    timers.push(purge);
    return () => {
      cancelledRef.current = true;
      timers.forEach(t => clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // The layer itself renders nothing — the flight elements are appended to
  // document.body imperatively (cheaper than React reconciliation per frame).
  // `flights` state only exists to keep this component mounted/live.
  return <div className="card-flight-layer" data-flight-count={flights.length} />;
}