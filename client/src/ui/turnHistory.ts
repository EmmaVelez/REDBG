import type { Action, GameState } from '@re/game-core';
import { defForInstance } from './cards';

/**
 * M4-T11: turn history — pretty-printed lines from the engine action log.
 *
 * The log is PUBLIC: every entry carries real card ids for every seat, exactly
 * as if the players were sitting around one table. Only hands and inventories
 * are hidden, and neither is ever logged. Each line shows the turn it happened
 * in, the acting seat's name, and a human description naming the cards used.
 */

export interface HistoryLine {
  readonly seq: number;
  readonly turn: number;
  readonly seat: number;
  readonly seatName: string;
  readonly text: string;
}

const VERBS: Record<Action['type'], string> = {
  playActionCard: 'played action',
  playItem: 'used item',
  playAmmo: 'played ammo',
  playWeapon: 'equipped weapon for exploring',
  explore: 'explored the Mansion',
  attack: 'attacked',
  buy: 'bought',
  useCharacterAbility: 'used an ability',
  endTurn: 'ended their turn',
  chooseOption: 'resolved a choice',
  startGame: 'started the game',
  attachToPartner: 'attached to partner',
  chooseExploreLeader: 'chose explore leader',
  moveXp: 'moved XP onto a Skill',
  useSkill: 'used a Skill',
  useWeaponAbility: 'activated a weapon effect',
  removeAttachedItem: 'removed an attached item',
};

function cardName(state: GameState, instanceId: string | undefined): string | null {
  if (instanceId === undefined) return null;
  const def = defForInstance(state, instanceId);
  return def !== null ? def.name : null;
}

function describe(state: GameState, action: Action): string {
  switch (action.type) {
    case 'playActionCard':
    case 'playItem':
    case 'playAmmo': {
      const name = cardName(state, action.instanceId);
      return name !== null ? `${VERBS[action.type]} ${name}` : VERBS[action.type];
    }
    case 'buy': {
      // Prefer the physical card the engine recorded on the log entry: a
      // single-card pile is empty by the time the history is rendered.
      const named = cardName(state, action.instanceId);
      if (named !== null) return `${VERBS.buy} ${named}`;
      const pile = state.marketPiles[action.pileId];
      if (pile !== undefined && pile.cards.length > 0) {
        const top = cardName(state, pile.cards[0]);
        if (top !== null) return `${VERBS.buy} ${top}`;
      }
      return `${VERBS.buy} (${action.pileId})`;
    }
    case 'explore': {
      // the weapons are public once used (they move to the play area), so name them
      const names = action.weapons
        .map(id => cardName(state, id))
        .filter((n): n is string => n !== null);
      const detail = names.length > 0
        ? ` with ${names.join(', ')}`
        : ` (${action.weapons.length} weapon${action.weapons.length === 1 ? '' : 's'})`;
      return `${VERBS.explore}${detail}`;
    }
    case 'endTurn':
      return VERBS.endTurn;
    default:
      return VERBS[action.type];
  }
}

/**
 * Renders the action log as human-readable lines with turn numbers.
 * Turn counter increments on every endTurn (matches the engine's advanceTurn).
 */
export function formatTurnHistory(state: GameState): readonly HistoryLine[] {
  const seatNames = state.seats.map(s => s.name);
  let turn = 1;
  const lines: HistoryLine[] = [];
  for (const entry of state.log) {
    const a = entry.action;
    const seat = 'seat' in a ? a.seat : -1;
    const line: HistoryLine = {
      seq: entry.seq,
      turn,
      seat,
      seatName: seat >= 0 ? (seatNames[seat] ?? `Seat ${seat}`) : '—',
      text: describe(state, a),
    };
    lines.push(line);
    if (a.type === 'endTurn') turn += 1;
  }
  return lines;
}