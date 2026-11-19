import type { JSX } from 'react';
import type { GameState, Action } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { defForInstance } from './cards';

/**
 * Fan "Locations" — the revealed room cards on the table.
 *
 * Each card shows its kind (GLOBAL / 1X / investment cost ladder), the
 * investment cubes placed on it (player number in a coloured circle), and —
 * for the viewing player on their own turn — the Invest / Use buttons.
 */

const SEAT_COLORS = ['#4da3ff', '#ff6b6b', '#ffd166', '#7ee081', '#c792ea', '#ff9f6e'];

function seatColor(seat: number): string {
  return SEAT_COLORS[seat % SEAT_COLORS.length] ?? '#aaaaaa';
}

function kindLabel(kind: string | undefined): string {
  if (kind === 'global') return 'GLOBAL';
  if (kind === 'onex') return '1X';
  if (kind === undefined) return '';
  return 'INVEST';
}

export interface LocationsRowProps {
  readonly state: GameState;
  readonly mySeat: number;
  readonly onAction: (action: Action) => void;
  readonly disabled?: boolean;
}

export function LocationsRow({ state, mySeat, onAction, disabled = false }: LocationsRowProps): JSX.Element | null {
  const locations = state.locations ?? [];
  if (locations.length === 0 && (state.locationDeck ?? []).length === 0) return null;

  const canAct = !disabled && state.activeSeat === mySeat && state.phase === 'main';
  const me = state.seats[mySeat];

  return (
    <div className="board-locations-row">
      <h2 className="board-section-title">
        Locations
        {(state.locationDeck ?? []).length > 0 && (
          <span className="zone-pile-count"> {(state.locationDeck ?? []).length} face-down</span>
        )}
      </h2>
      <div className="locations-row">
        {locations.map(loc => {
          const def = defForInstance(state, loc.instanceId);
          if (def === null) return null;
          const kind = def.locationKind;
          const cubes = Object.entries(loc.cubes).flatMap(([seat, n]) =>
            Array.from({ length: n }, () => Number(seat)),
          );
          const costs = def.locationCosts ?? (kind === 'onex' ? [def.locationCost ?? 0] : []);
          const myCubes = loc.cubes[mySeat] ?? 0;
          const nextCost = costs[myCubes];
          const used = (me?.locationUsesThisTurn ?? []).filter(x => x === loc.instanceId).length;
          const capped = def.locationMaxPerTurn !== undefined && used >= def.locationMaxPerTurn;
          const canInvest = canAct && kind === 'invest' && nextCost !== undefined
            && (me?.turnGold ?? 0) >= nextCost && (me?.buysLeft ?? 0) >= 1;
          const canUse = canAct && kind === 'onex' && !capped
            && (me?.turnGold ?? 0) >= (def.locationCost ?? 0) && (me?.buysLeft ?? 0) >= 1;
          return (
            <HoverCard key={loc.instanceId} def={def}>
            <div className={`location-card location-kind-${kind ?? 'invest'}`}>
              <div className="location-kind-badge">{kindLabel(kind)}</div>
              <CardView def={def} compact artOnly />
              <div className="location-name">{def.name}</div>
              {costs.length > 0 && (
                <div className="location-costs">
                  {costs.map((c, i) => (
                    <span key={i} className={`location-cost ${i < myCubes ? 'location-cost-paid' : ''}`}>{c}g</span>
                  ))}
                </div>
              )}
              {cubes.length > 0 && (
                <div className="location-cubes">
                  {cubes.map((seat, i) => (
                    <span key={i} className="location-cube" style={{ backgroundColor: seatColor(seat) }}>{seat + 1}</span>
                  ))}
                </div>
              )}
              <div className="location-actions">
                {kind === 'invest' && (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!canInvest}
                    title={nextCost === undefined ? 'Fully invested' : `Invest: ${nextCost}g + 1 Buy`}
                    onClick={() => onAction({ type: 'investLocation', seat: mySeat, instanceId: loc.instanceId })}
                  >
                    Invest{nextCost !== undefined ? ` ${nextCost}g` : ''}
                  </button>
                )}
                {kind === 'onex' && (
                  <button
                    type="button"
                    className="btn btn-small"
                    disabled={!canUse}
                    title={capped ? 'Max once per turn' : `Use: ${def.locationCost ?? 0}g + 1 Buy`}
                    onClick={() => {
                      const effects = def.locationRevealEffects ?? [];
                      if (effects.some(e => e.kind === 'passageUpgrade')) {
                        onAction({ type: 'passageStart', seat: mySeat });
                      } else if (effects.some(e => e.kind === 'atticUpgrade')) {
                        onAction({ type: 'atticStart', seat: mySeat });
                      } else {
                        onAction({ type: 'useLocation', seat: mySeat, instanceId: loc.instanceId });
                      }
                    }}
                  >
                    Use {def.locationCost ?? 0}g
                  </button>
                )}
                {kind === 'global' && <span className="location-global-note">active for everyone</span>}
              </div>
            </div>
            </HoverCard>
          );
        })}
        {(state.locationDeck ?? []).length > 0 && (
          <div className="location-card location-card-facedown">
            <div className="location-kind-badge">?</div>
            <img src="/mansion-deck.svg" alt="Face-down location" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }} />
            <div className="location-name">Next: Location</div>
            <div className="location-global-note">Revealed by an Explore</div>
          </div>
        )}
      </div>
    </div>
  );
}
