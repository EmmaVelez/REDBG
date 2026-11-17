import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/** Fan "JP 2025" action cards: CAC-005 Combat Medic, CAC-010 Onslaught. */

let counter = 0;

function game(over: Partial<PlayerState> = {}, seats = 2): GameState {
  const players = Array.from({ length: seats }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? 'ch-002' : 'ch-001',
  }));
  const s = setup({ seed: 11, players }, [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function place(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea' = 'hand'): { state: GameState; id: string } {
  const id = `${cardId}#cac${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } };
  const seats = s.seats.map((p, i) => {
    if (i !== seat) return p;
    return zone === 'hand' ? { ...p, hand: [...p.hand, id] } : { ...p, playArea: [...p.playArea, id] };
  });
  return { state: { ...s, cards, seats }, id };
}

describe('JP 2025 actions — data', () => {
  it('defines both with the printed cost and bonuses', () => {
    const medic = CUSTOM_CARDS.find(c => c.id === 'cac-005');
    expect(medic).toEqual(expect.objectContaining({
      id: 'cac-005', name: 'Combat Medic', type: 'action', cost: 50,
      bonuses: { gold: 20, actions: 1, buys: 1 },
    }));
    const onslaught = CUSTOM_CARDS.find(c => c.id === 'cac-010');
    expect(onslaught).toEqual(expect.objectContaining({
      id: 'cac-010', name: 'Onslaught', type: 'action', cost: 60,
      bonuses: { ammo: 10, cards: 1 },
    }));
  });

  it('ships art for both', () => {
    for (const id of ['CAC-005', 'CAC-010']) {
      expect(existsSync(`src/data/CARD-ART/${id}.png`), id).toBe(true);
    }
  });
});

describe('CAC-005 Combat Medic — heal on the first gain', () => {
  it('offers the heal once, on the first gain of the turn', () => {
    let s = game({ level: 1, hp: 50, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    const played = place(s, 0, 'cac-005');
    s = played.state;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: played.id });
    // The card's own bonuses (+20 Gold, +1 Action, +1 Buy).
    expect((s.seats[0] as PlayerState).turnGold).toBe(120);

    // First gain of the turn -> the heal offer.
    const pileId = Object.keys(s.marketPiles).find(k => s.marketPiles[k]!.cards.length > 0)!;
    const gained = applyAction(s, { type: 'buy', seat: 0, pileId });
    const prompt = gained.prompts.find(p => p.payload?.kind === 'cac005HealChoice');
    expect(prompt).toBeDefined();

    const healed = applyAction(gained, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect((healed.seats[0] as PlayerState).hp).toBe(60);
    expect((healed.seats[0] as PlayerState).cac005HealUsedThisTurn).toBe(true);

    // A second gain this turn offers nothing more.
    const second = applyAction(healed, { type: 'buy', seat: 0, pileId });
    expect(second.prompts.some(p => p.payload?.kind === 'cac005HealChoice')).toBe(false);
  });

  it('declining still consumes the once-per-turn heal', () => {
    let s = game({ level: 1, hp: 50, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    const played = place(s, 0, 'cac-005');
    s = applyAction(played.state, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const pileId = Object.keys(s.marketPiles).find(k => s.marketPiles[k]!.cards.length > 0)!;
    const gained = applyAction(s, { type: 'buy', seat: 0, pileId });
    const prompt = gained.prompts.find(p => p.payload?.kind === 'cac005HealChoice')!;
    const declined = applyAction(gained, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: prompt.options.length - 1 });
    expect((declined.seats[0] as PlayerState).hp).toBe(50);
    expect((declined.seats[0] as PlayerState).cac005HealUsedThisTurn).toBe(true);
  });
});

describe('CAC-010 Onslaught — attach, then a turn-start bonus', () => {
  it('attaches on play, then pays its icons +20 Damage at the next turn start and discards', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    const played = place(s, 0, 'cac-010');
    s = played.state;
    const afterPlay = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: played.id });
    const seat = afterPlay.seats[0] as PlayerState;
    expect(seat.attached).toContain(played.id);
    expect(seat.playArea).not.toContain(played.id);
    expect(afterPlay.cards[played.id]?.location.zone).toBe('attached');
    // Its own bonuses apply on the play (+10 Ammo, +1 Card).
    expect(seat.turnAmmo).toBe(10);
    // +1 Card, minus the played card (the inventory may be too small to draw,
    // so compare the DRAW ATTEMPT rather than assuming a full hand).
    expect(seat.hand.length).toBeGreaterThan((s.seats[0] as PlayerState).hand.length - 1);

    // Walk to seat 0's next turn.
    const seat1 = startTurn(applyAction(afterPlay, { type: 'endTurn', seat: 0 }));
    const seat0again = startTurn(applyAction(seat1, { type: 'endTurn', seat: 1 }));
    expect(seat0again.activeSeat).toBe(0);
    const now = seat0again.seats[0] as PlayerState;
    expect(now.attached).not.toContain(played.id);
    expect(now.discard).toContain(played.id);
    // +10 Ammo and the +1 Card applied, plus +20 Damage this turn.
    expect(now.turnAmmo).toBe(10);
    expect(now.weaponDamageBonusThisTurn).toBe(20);
  });
});
