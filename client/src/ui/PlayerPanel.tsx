import type { JSX } from 'react';
import type { GameState, PlayerState } from '@re/game-core';
import { CardView } from './CardView';
import { CharacterCards } from './CharacterCards';
import { CharacterSkills } from './CharacterSkills';
import { HealthRing } from './HealthRing';
import { defForInstance } from './cards';

/**
 * M4-T06: PlayerPanel — character, life, level, decorations, resource pools,
 * and deck stats for one seat. Shows all that for every player.
 *
 * Since the log/information rework the only secret zones are a seat's hand and
 * inventory, so another player's Play Area and Discard pile are rendered here
 * too — they are public across a real table. (Your own Play Area already lives
 * in the board's "Your table" section, so it is not repeated in your panel.)
 */

export interface PlayerPanelProps {
  readonly state: GameState;
  readonly seat: number;
  /** True when this is the viewing client's own seat. */
  readonly isMe?: boolean;
  /** The viewing player's own character/partner cards live in the action bar. */
  readonly showCharacterCards?: boolean;
}

export function PlayerPanel({ state, seat, isMe = false, showCharacterCards = true }: PlayerPanelProps): JSX.Element {
  const player: PlayerState | undefined = state.seats[seat];
  if (player === undefined) {
    return <div className="player-panel" data-seat={seat}>—</div>;
  }
  const charDef = defForInstance(state, player.characterInstanceId);
  const discardTopId = player.discard[0];
  const discardTopDef = discardTopId === undefined ? null : defForInstance(state, discardTopId);
  const statusBits: string[] = [];
  if (player.downed) statusBits.push('downed');
  if (player.dead) statusBits.push('dead');
  const status = statusBits.length > 0 ? ` (${statusBits.join(', ')})` : '';

  return (
    <div className={`player-panel ${player.downed ? 'player-downed' : ''} ${player.dead ? 'player-dead' : ''}`} data-seat={seat} data-me={isMe || undefined}>
      <div className="player-header">
        <span className="player-name">{player.name}{status}</span>
        {isMe && <span className="player-me">YOU</span>}
        {charDef !== null && <span className="player-character">{charDef.name} · Lv{player.level}</span>}
      </div>
      <div className="player-row">
        <span className="player-hp">HP {player.hp}/{player.maxHp}</span>
        <span className="player-decorations">★ {player.decorations}</span>
        {/* Attached sits with HP/Decorations — it is a score, not a deck
            statistic, and it is the one count a slim mobile chip still shows. */}
        <span title="Defeated infected attached">Attached {player.attached.length}</span>
      </div>
      <div className="player-row player-pools">
        <span title="Ammo">Ammo {player.turnAmmo}</span>
        <span title="Gold">Gold {player.turnGold}</span>
        <span title="Actions remaining">Actions {player.actionsLeft}</span>
        <span title="Buys remaining">Buys {player.buysLeft}</span>
        <span title="Explores remaining">Explore {player.exploresLeft}</span>
      </div>
      <div className="player-row player-deck-stats">
        <span title="Draw pile">Deck {player.inventory.length}</span>
        <span title="Discard pile">Discard {player.discard.length}</span>
        <span title="Hand">Hand {player.hand.length}</span>
      </div>
      {!isMe && (
        <div className="player-public-zones" data-public-zones>
          <div className="player-public-row">
            <span className="player-zone-label">In play</span>
            <div className="player-public-cards">
              {player.playArea.length === 0
                ? <span className="zone-empty">none</span>
                : player.playArea.map(id => {
                    const def = defForInstance(state, id);
                    return def === null ? null : <CardView key={id} def={def} compact />;
                  })}
            </div>
          </div>
          <div className="player-public-row">
            <span className="player-zone-label">Discard</span>
            <div className="player-public-cards">
              {player.discard.length === 0
                ? <span className="zone-empty">empty</span>
                : (
                  <>
                    {discardTopDef !== null && <CardView def={discardTopDef} compact />}
                    <span className="player-public-count" title={`${player.discard.length} card(s) in the discard pile`}>
                      ×{player.discard.length}
                    </span>
                  </>
                )}
            </div>
          </div>
        </div>
      )}
      {showCharacterCards && <CharacterCards state={state} seat={seat} />}
      {charDef !== null && <CharacterSkills state={state} seat={seat} />}
    </div>
  );
}