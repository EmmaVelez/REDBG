import type { JSX } from 'react';
import type { GameState, PlayerState } from '@re/game-core';
import { CardView } from './CardView';
import { HoverCard } from './HoverCard';
import { CharacterSkills } from './CharacterSkills';
import { HealthRing } from './HealthRing';
import { defForInstance } from './cards';

/**
 * M4-T06: PlayerPanel — character, life, level, decorations, resource pools,
 * and deck stats for one seat. Shows all that for every player (server
 * sanitized views hide other players' card contents, but counts are public).
 */

export interface PlayerPanelProps {
  readonly state: GameState;
  readonly seat: number;
  /** True when this is the viewing client's own seat. */
  readonly isMe?: boolean;
}

export function PlayerPanel({ state, seat, isMe = false }: PlayerPanelProps): JSX.Element {
  const player: PlayerState | undefined = state.seats[seat];
  if (player === undefined) {
    return <div className="player-panel" data-seat={seat}>—</div>;
  }
  const charDef = defForInstance(state, player.characterInstanceId);
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
        <span title="Defeated infected attached">Attached {player.attached.length}</span>
      </div>
      {charDef !== null && (
        <div className="player-character-card" data-character-card data-anim-zone="attached">
          <HoverCard def={charDef} decorations={player.decorations} hp={player.hp} maxHp={player.maxHp}>
            <CardView def={charDef} compact decorations={player.decorations} hp={player.hp} maxHp={player.maxHp} />
          </HoverCard>
        </div>
      )}
      {charDef !== null && <CharacterSkills state={state} seat={seat} />}
    </div>
  );
}