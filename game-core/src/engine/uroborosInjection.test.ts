import { describe, expect, it } from 'vitest';
import type { CardInstance, GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { FIRST_TIMER_PILES, STANDARD_MANSION_DECK, PREMIER_CARDS } from '../data/cards';
import { ALLIANCE_CARDS } from '../data/alliance';

/**
 * AC-018 Uroboros Injection — "During another player turn, you may trash this
 * card to give +20 health to a revealed infected of your choice."
 *
 * The +20 Health can flip the combat OUTCOME, so the explore is DEFERRED while
 * the reactive prompt is open and re-resolved once every eligible player has
 * answered. Declining applies nothing.
 */

const CARDS = [...PREMIER_CARDS, ...ALLIANCE_CARDS];

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'Hero', controller: 'human', characterCardId: 'ch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    CARDS,
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function nextId(cardId: string): string {
  return `${cardId}#u${++counter}`;
}

function addCard(s: GameState, seat: number, cardId: string): GameState {
  const id = nextId(cardId);
  const inst: CardInstance = { instanceId: id, cardId, location: { zone: 'hand', index: 0, seat } };
  return {
    ...s,
    cards: { ...s.cards, [id]: inst },
    seats: s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p)),
  };
}

function mansionTop(s: GameState, cardId: string): GameState {
  const id = nextId(cardId);
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } },
    mansionDeck: [id, ...s.mansionDeck],
  };
}

function findHand(s: GameState, cardId: string, seat = 0): string {
  const id = (s.seats[seat]?.hand ?? []).find(hid => s.cards[hid]?.cardId === cardId);
  if (id === undefined) throw new Error(`card ${cardId} not in hand of seat ${seat}`);
  return id;
}

function findPrompt(s: GameState, kind: string): string {
  const p = s.prompts.find(x => x.payload?.kind === kind);
  if (p === undefined) throw new Error(`prompt ${kind} not found (have: ${s.prompts.map(x => x.payload?.kind).join(',')})`);
  return p.id;
}

function choose(s: GameState, seat: number, promptId: string, option: number): GameState {
  return applyAction(s, { type: 'chooseOption', seat, promptId, option });
}

/** Hero explores once with the given weapon; the Infected on top is ma-001. */
function exploreWith(cardId: string, hp: number): { explored: GameState; weapon: string } {
  const withFoe = addCard(game({ hp }), 1, 'ac-018');
  const withInfected = mansionTop(withFoe, 'ma-001'); // hp 20, attack 10
  const withWeapon = addCard(withInfected, 0, cardId); // we-002 = 25 damage
  const weapon = findHand(withWeapon, cardId);
  const explored = applyAction(tune(withWeapon, { turnAmmo: 200 }), {
    type: 'explore',
    seat: 0,
    weapons: [weapon],
    exploreCount: 1,
  });
  return { explored, weapon };
}

describe('AC-018 Uroboros Injection', () => {
  it('offers the reactive trash window to another player holding the card', () => {
    const { explored } = exploreWith('we-002', 70);
    const prompt = explored.prompts.find(p => p.payload?.kind === 'uroborosInjection');
    expect(prompt).toBeDefined();
    expect(prompt?.seat).toBe(1);
    expect(prompt?.options).toContain('Decline');
    // The explore is held: nothing has been applied yet.
    expect(explored.pendingExplore).toBeDefined();
    expect(explored.seats[0]?.hp).toBe(70);
  });

  it('trashing it gives the revealed Infected +20 Health and re-resolves the explore', () => {
    const { explored } = exploreWith('we-002', 70);
    const resolved = choose(explored, 1, findPrompt(explored, 'uroborosInjection'), 0);
    // 20 + 20 = 40 > the 25 dealt, so the Infected survives and deals 10 Damage.
    expect(resolved.seats[0]?.hp).toBe(60);
    expect(resolved.seats[0]?.decorations).toBe(0);
    expect(resolved.removed.some(id => resolved.cards[id]?.cardId === 'ma-001')).toBe(false);
    expect(resolved.removed.some(id => resolved.cards[id]?.cardId === 'ac-018')).toBe(true);
    expect(resolved.pendingExplore).toBeUndefined();
    expect(resolved.prompts.some(p => p.payload?.kind === 'uroborosInjection')).toBe(false);
  });

  it('declining leaves the explore outcome alone', () => {
    const { explored } = exploreWith('we-002', 70);
    const prompt = explored.prompts.find(p => p.payload?.kind === 'uroborosInjection');
    const declineIndex = prompt?.options.indexOf('Decline') ?? -1;
    const resolved = choose(explored, 1, findPrompt(explored, 'uroborosInjection'), declineIndex);
    // 25 >= 20, so the Infected is defeated: no Damage, +1 Decoration.
    expect(resolved.seats[0]?.hp).toBe(70);
    expect(resolved.seats[0]?.decorations).toBe(1);
    expect(resolved.removed.some(id => resolved.cards[id]?.cardId === 'ma-001')).toBe(true);
    expect(resolved.seats[1]?.hand.some(id => resolved.cards[id]?.cardId === 'ac-018')).toBe(true);
    expect(resolved.pendingExplore).toBeUndefined();
  });
});
