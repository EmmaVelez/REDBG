import type { Action, GameState } from '@re/game-core';
import { defForInstance } from './cards';

/**
 * M4-T11: turn history — pretty-printed lines from the engine action log.
 *
 * The server sanitizes the log per viewer: entries for OTHER seats carry
 * placeholder card ids (hidden-...), so names only resolve for the viewer's
 * own actions; the action kind + public data remain visible either way.
 * Each line shows the turn it happened in, the acting seat's name, and a
 * human description.
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
  buy: 'bought',
  useCharacterAbility: 'used an ability',
  endTurn: 'ended their turn',
  chooseOption: 'resolved a choice',
  startGame: 'started the game',
  attachToPartner: 'attached to partner',
  chooseExploreLeader: 'chose explore leader',
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
      const pile = state.marketPiles[action.pileId];
      if (pile !== undefined && pile.cards.length > 0) {
        const top = cardName(state, pile.cards[0]);
        if (top !== null) return `${VERBS.buy} ${top}`;
      }
      return `${VERBS.buy} (${action.pileId})`;
    }
    case 'explore':
      return `${VERBS.explore} (${action.weapons.length} weapon${action.weapons.length === 1 ? '' : 's'})`;
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