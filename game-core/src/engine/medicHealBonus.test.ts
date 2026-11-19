import { describe, expect, it } from 'vitest';
import type { CardInstance, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { FIRST_TIMER_PILES, STANDARD_MANSION_DECK, PREMIER_CARDS } from '../data/cards';
import { MERCENARIES_CARDS } from '../data/mercenaries';

/**
 * SK-004 Medic LV.1 — "When you would Heal your Character, you can Heal that
 * amount, plus 10 instead." The +10 is a CHOICE: the base heal lands and a
 * follow-up prompt offers the bonus.
 */

const CARDS = [...PREMIER_CARDS, ...MERCENARIES_CARDS];

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 7, players: [{ name: 'A', controller: 'human', characterCardId: 'ch-044' }] },
    CARDS,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function injectSkill(s: GameState, seat: number, cardId: string, xp: number): GameState {
  const instanceId = `${cardId}#test-${seat}`;
  const inst: CardInstance = { instanceId, cardId, xp, location: { zone: 'skillArea', index: 0 } };
  return {
    ...s,
    cards: { ...s.cards, [instanceId]: inst },
    seats: s.seats.map((p, i) => (i === seat ? { ...p, skills: [...(p.skills ?? []), instanceId] } : p)),
  };
}

let counter = 0;
function addItem(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat } } },
      seats: s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p)),
    },
    id,
  };
}

/** Play a Green Herb and resolve the heal-target prompt with `option`. */
function healOnce(s: GameState, option: number): GameState {
  const herb = addItem(s, 0, 'it-001');
  const played = applyAction(herb.state, { type: 'playItem', seat: 0, instanceId: herb.id });
  const heal = played.prompts.find(p => p.payload?.kind === 'healGreenHerb');
  expect(heal).toBeDefined();
  return applyAction(played, { type: 'chooseOption', seat: 0, promptId: heal!.id, option });
}

describe('SK-004 Medic LV.1', () => {
  it('offers the +10 after the base heal, and accepting applies it', () => {
    let s = injectSkill(game({ hp: 40 }), 0, 'sk-004', 1);
    let next = healOnce(s, 0);
    expect(next.seats[0]?.hp).toBe(60); // 40 + 20 base

    const bonus = next.prompts.find(p => p.payload?.kind === 'medicHealBonusChoose');
    expect(bonus).toBeDefined();
    next = applyAction(next, { type: 'chooseOption', seat: 0, promptId: bonus!.id, option: 0 });
    expect(next.seats[0]?.hp).toBe(70);
    expect(next.prompts.some(p => p.payload?.kind === 'medicHealBonusChoose')).toBe(false);
  });

  it('declining leaves the base heal only', () => {
    let s = injectSkill(game({ hp: 40 }), 0, 'sk-004', 1);
    let next = healOnce(s, 0);
    const bonus = next.prompts.find(p => p.payload?.kind === 'medicHealBonusChoose')!;
    next = applyAction(next, { type: 'chooseOption', seat: 0, promptId: bonus.id, option: 1 });
    expect(next.seats[0]?.hp).toBe(60);
  });

  it('does not offer the bonus when no Medic skill is active', () => {
    const next = healOnce(game({ hp: 40 }), 0);
    expect(next.prompts.some(p => p.payload?.kind === 'medicHealBonusChoose')).toBe(false);
    expect(next.seats[0]?.hp).toBe(60);
  });

  it('does not offer the bonus when the heal is already capped', () => {
    let s = injectSkill(game({ hp: 95 }), 0, 'sk-004', 1);
    let next = healOnce(s, 0);
    expect(next.seats[0]?.hp).toBe(100); // clamped
    expect(next.prompts.some(p => p.payload?.kind === 'medicHealBonusChoose')).toBe(false);
  });
});
