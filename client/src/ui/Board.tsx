import type { JSX } from 'react';
import type { GameState, Action } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { PlayerPanel } from './PlayerPanel';
import { Hand } from './Hand';
import { Zones } from './Zones';
import { ZonePile } from './ZonePile';
import { CardFlightLayer } from './CardFlightLayer';
import { defForInstance, costText } from './cards';

/**
 * M4-T05: Board — the table. Market resource piles (click to buy), Mansion
 * deck counts, every player's panel, and the viewing player's hand + zones.
 * The CardFlightLayer animates cards moving between anchored zones.
 */

export interface BoardProps {
  readonly state: GameState;
  readonly mySeat: number;
  readonly onAction: (action: Action) => void;
  readonly disabled?: boolean;
}

export function Board({ state, mySeat, onAction, disabled = false }: BoardProps): JSX.Element {
  const piles = Object.values(state.marketPiles)
    .filter(p => p.cards.length > 0)
    .sort((a, b) => a.pileId.localeCompare(b.pileId));
  const canBuy = state.activeSeat === mySeat && state.phase === 'main';

  return (
    <div className="board">
      <div className="board-market">
        <h2 className="board-section-title">Resource Area</h2>
        <div className="market-piles">
          {piles.map(pile => {
            const topId = pile.cards[0];
            const def = defForInstance(state, topId);
            const count = pile.cards.length;
            if (def === null) {
              return (
                <div key={pile.pileId} className="market-pile">
                  <span>Empty</span> <span className="pile-count">{count}</span>
                </div>
              );
            }
            const clickable = canBuy && !disabled && state.seats[mySeat] !== undefined && state.seats[mySeat]?.turnGold >= (def.cost ?? 0);
            return (
              <button
                key={pile.pileId}
                type="button"
                className="market-pile"
                data-pile={pile.pileId}
                data-anim-zone={`market-${pile.pileId}`}
                onClick={() => clickable && onAction({ type: 'buy', seat: mySeat, pileId: pile.pileId })}
                disabled={!clickable}
                title={`Buy ${def.name} for ${costText(def)} gold`}
              >
                <HoverCard def={def}>
                  <CardView def={def} compact />
                </HoverCard>
                <span className="pile-count">{count} left</span>
                <span className="pile-cost">{costText(def)}g</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="board-mansion">
        <h2 className="board-section-title">Mansion</h2>
        <div className="mansion-piles">
          <ZonePile label="Deck" count={state.mansionDeck.length} animZone="mansion" />
          <div className="mansion-counts" data-anim-zone="mansionBottom">
            <span>Bottom: {state.mansionBottom.length}</span>
            <span>Removed: {state.removed.length}</span>
          </div>
        </div>
      </div>

      <div className="board-players">
        {state.seats.map(player => (
          <PlayerPanel key={player.seat} state={state} seat={player.seat} isMe={player.seat === mySeat} />
        ))}
      </div>

      <div className="board-self">
        <h2 className="board-section-title">Your table</h2>
        <Zones state={state} seat={mySeat}>
          <Hand state={state} seat={mySeat} onPlay={instanceId => onPlayFromHand(state, mySeat, instanceId, onAction)} disabled={disabled || state.activeSeat !== mySeat || state.phase !== 'main'} />
        </Zones>
      </div>

      <CardFlightLayer state={state} />
    </div>
  );
}

/** Route a hand click to the right action kind by card type. */
function onPlayFromHand(state: GameState, seat: number, instanceId: string, onAction: (a: Action) => void): void {
  const def = defForInstance(state, instanceId);
  if (def === null) return;
  switch (def.type) {
    case 'action':
      onAction({ type: 'playActionCard', seat, instanceId });
      return;
    case 'item':
      onAction({ type: 'playItem', seat, instanceId });
      return;
    case 'ammunition':
      onAction({ type: 'playAmmo', seat, instanceId });
      return;
    case 'weapon':
      onAction({ type: 'playWeapon', seat, instanceId });
      return;
    default:
      return; // weapons are used via Explore, characters/others have no play action
  }
}