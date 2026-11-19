import type { JSX } from 'react';
import type { GameState, Action } from '@re/game-core';
import { locationBuyCostReduction } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { PlayerPanel } from './PlayerPanel';
import { Zones } from './Zones';
import { ZonePile } from './ZonePile';
import { CardFlightLayer } from './CardFlightLayer';
import { defForInstance, costText } from './cards';
import { LocationsRow } from './LocationsRow';

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
  /** YOU DIED overlay is up — hold character-card flips until it resolves. */
  readonly overlayOpen?: boolean;
}

export function Board({ state, mySeat, onAction, disabled = false, overlayOpen = false }: BoardProps): JSX.Element {
  const piles = Object.values(state.marketPiles)
    .filter(p => p.cards.length > 0)
    .sort((a, b) => a.pileId.localeCompare(b.pileId));
  const canBuy = state.activeSeat === mySeat && state.phase === 'main';
  // Tiger Statue Room (loc-015): the investor's buys cost 10 less gold. The
  // engine + validator already honour it; the button must too, or a player
  // who can afford the discounted price is locked out of buying.
  const buyDiscount = canBuy ? locationBuyCostReduction(state, mySeat) : 0;

  return (
    <div className="board">
      <div className="board-market">
        <h2 className="board-section-title">Resource Area</h2>
        <div className="market-piles">
          {piles.map(pile => {
            const topId = pile.cards[0];
            const def = defForInstance(state, topId);
            const count = pile.cards.length;
            // Bar (loc-022) XP tokens: a circular #xp badge crowns the pile.
            const xpCount = (state.xpTokens ?? []).filter(t => t === pile.pileId).length;
            const xpBadge = xpCount > 0
              ? <span className="xp-token-badge" title="XP token: spend 1 XP to buy from this pile (2 XP also removes the token)">{xpCount}xp</span>
              : null;
            if (def === null) {
              return (
                <div key={pile.pileId} className="market-pile">
                  {xpBadge}
                  <span>Empty</span> <span className="pile-count">{count}</span>
                </div>
              );
            }
            const effectiveCost = Math.max(0, (def.cost ?? 0) - buyDiscount);
            const clickable = canBuy && !disabled && state.seats[mySeat] !== undefined && state.seats[mySeat]?.turnGold >= effectiveCost;
            return (
              <button
                key={pile.pileId}
                type="button"
                className="market-pile"
                data-pile={pile.pileId}
                data-anim-zone={`market-${pile.pileId}`}
                onClick={() => clickable && onAction({ type: 'buy', seat: mySeat, pileId: pile.pileId })}
                disabled={!clickable}
                title={`Buy ${def.name} for ${effectiveCost} gold${buyDiscount > 0 ? ` (Tiger Statue Room: −${buyDiscount})` : ''}${xpCount > 0 ? ' — XP token: spend 1 XP first (2 XP also removes the token)' : ''}`}
              >
                {xpBadge}
                <HoverCard def={def}>
                  <CardView def={def} compact artOnly />
                </HoverCard>
                <span className="pile-count">{count} left</span>
                <span className="pile-cost">{buyDiscount > 0 ? `${effectiveCost}g` : `${costText(def)}g`}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="board-mansion-row">
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
              {(state.locationDeck ?? []).length > 0 && (
                <span className="mansion-attachment-badge location-badge" title="Face-down locations">{(state.locationDeck ?? []).length}</span>
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
      </div>

      <LocationsRow state={state} mySeat={mySeat} onAction={onAction} disabled={disabled} />

      <div className="board-self">
        <h2 className="board-section-title">Your table</h2>
        <Zones state={state} seat={mySeat} />
      </div>

      <CardFlightLayer state={state} />
    </div>
  );
}