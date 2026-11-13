import type { JSX } from 'react';
import type { GameState, Action } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { PlayerPanel } from './PlayerPanel';
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
                  <CardView def={def} compact artOnly />
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
          <div className="zone-pile mansion-pile-hover-target" data-anim-zone="mansion" data-pile-count={state.mansionDeck.length}>
            <span className="zone-pile-label">Deck</span>
            <div className="zone-pile-stack">
              <img src="/mansion-deck.svg" alt="Mansion deck" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }} />
            </div>
            <span className="zone-pile-count">{state.mansionDeck.length}</span>
            {(state.mansionAttachments ?? []).length > 0 && (
              <div className="mansion-attachments-hover">
                <span className="mansion-attachment-badge">{(state.mansionAttachments ?? []).length}</span>
                <div className="mansion-attachments-popup">
                  {(state.mansionAttachments ?? []).map(id => {
                    const def = defForInstance(state, id);
                    return def === null ? null : (
                      <div key={id} className="mansion-attachment-card">
                        <CardView def={def} compact artOnly />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="mansion-counts">
            <span>Removed: {state.removed.length}</span>
            {(state.mansionAttachments ?? []).length > 0 && (
              <span>Attached: {(state.mansionAttachments ?? []).length}</span>
            )}
          </div>
        </div>
      </div>

      <div className="board-players">
        {/* The viewing player's own panel is deliberately absent: their
            character/partner cards, life, decorations, resources, deck and
            discard all live in the action bar, so a second copy here was pure
            duplication (and the biggest block on the board). */}
        {state.seats.filter(player => player.seat !== mySeat).map(player => (
          <PlayerPanel key={player.seat} state={state} seat={player.seat} isMe={false} showCharacterCards />
        ))}
      </div>

      <div className="board-self">
        <h2 className="board-section-title">Your table</h2>
        <Zones state={state} seat={mySeat} />
      </div>

      <CardFlightLayer state={state} />
    </div>
  );
}