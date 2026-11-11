import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState, Prompt } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import {
  ALL_CARDS,
  FIRST_TIMER_PILES,
  STANDARD_MANSION_DECK,
  cardsForScenario,
  pilesForScenario,
} from '../data/cards';

/**
 * IT-000 Antique Coin — "You can Trash this Item to Gain one Weapon from the
 * Resource Area with cost equal to, or less than, Antique Coin's cost."
 *
 * It is a MANSION item: two copies are shuffled into the Mansion deck and it
 * never gets a Resource Area pile, even though it prints a cost. Trashing it
 * (playing it from hand) offers a choice of Resource Area weapons costing no
 * more than the coin's own cost.
 */

const COIN = 'it-000';

function coinDef() {
  const d = CUSTOM_CARDS.find(c => c.id === COIN);
  if (d === undefined) throw new Error('missing it-000 in CUSTOM_CARDS');
  return d;
}

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    cardsForScenario('firstTimer', { customCards: [COIN] }),
    pilesForScenario('firstTimer', { customCards: [COIN] }),
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;

function addCard(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

function answer(s: GameState, kind: string, option: number): GameState {
  const prompt: Prompt | undefined = s.prompts.find(p => p.payload?.kind === kind);
  if (prompt === undefined) {
    throw new Error(`no ${kind} prompt (have: ${s.prompts.map(p => p.payload?.kind).join(',')})`);
  }
  return applyAction(s, { type: 'chooseOption', seat: prompt.seat, promptId: prompt.id, option });
}

function playCoin(s: GameState, seat = 0): GameState {
  const id = s.seats[seat]?.hand.find(hid => s.cards[hid]?.cardId === COIN);
  if (id === undefined) throw new Error('coin not in hand');
  return applyAction(s, { type: 'playItem', seat, instanceId: id });
}

/** Move the first copy of `cardId` in the Mansion to the top of the deck. */
function putOnMansionTop(s: GameState, cardId: string): { state: GameState; id: string } {
  const id = s.mansionDeck.find(mid => s.cards[mid]?.cardId === cardId);
  if (id === undefined) throw new Error(`${cardId} not in the mansion deck`);
  return { state: { ...s, mansionDeck: [id, ...s.mansionDeck.filter(mid => mid !== id)] }, id };
}

describe('IT-000 Antique Coin data', () => {
  it('matches the printed card', () => {
    expect(coinDef()).toEqual(expect.objectContaining({
      id: 'it-000',
      name: 'Antique Coin',
      type: 'item',
      set: 'custom',
      copies: 2,
      cost: 60,
      mansion: true,
      itemEffects: [{ kind: 'gainWeaponFromMarket', costLimit: 60 }],
    }));
    expect(coinDef().text).toBe(
      "You can Trash this Item to Gain one Weapon from the Resource Area with cost equal to, or less than, Antique Coin's cost."
    );
  });

  it('is NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    expect(ALL_CARDS.some(c => c.id === COIN)).toBe(false);
    expect(cardsForScenario('firstTimer').some(c => c.id === COIN)).toBe(false);
    expect(cardsForScenario('firstTimer', { customCards: [COIN] }).some(c => c.id === COIN)).toBe(true);
  });

  it('is a Mansion card (two copies), never a Resource Area pile', () => {
    const piles = pilesForScenario('firstTimer', { customCards: [COIN] });
    expect(piles.map(p => p.pileId)).not.toContain(`custom-${COIN}`);

    const s = game();
    expect(s.mansionDeck.filter(id => s.cards[id]?.cardId === COIN)).toHaveLength(2);
  });
});

describe('IT-000 Antique Coin resolution', () => {
  it('trashing it offers every Resource Area weapon costing no more than 60', () => {
    const { state, id } = addCard(game(), 0, COIN);
    const after = applyAction(state, { type: 'playItem', seat: 0, instanceId: id });
    expect(after.removed).toContain(id);

    const prompt = after.prompts.find(p => p.payload?.kind === 'antiqueCoinChooseWeapon');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const offered = prompt.options.map(o => after.cards[o]?.cardId);
    // we-010 Burst-Fire Handgun costs exactly 60 — the boundary is inclusive.
    expect(offered).toContain('we-010');
    // Everything dearer than the coin is excluded.
    for (const tooDear of ['we-006', 'we-012', 'we-014', 'we-016']) {
      expect(offered).not.toContain(tooDear);
    }
  });

  it('the chosen weapon leaves its pile for the trash-coin player\'s discard', () => {
    const { state, id } = addCard(game(), 0, COIN);
    const after = applyAction(state, { type: 'playItem', seat: 0, instanceId: id });
    const prompt = after.prompts.find(p => p.payload?.kind === 'antiqueCoinChooseWeapon');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;

    const chosen = prompt.options[0] as string;
    const next = answer(after, 'antiqueCoinChooseWeapon', 0);
    expect(next.seats[0]?.discard).toContain(chosen);
    for (const pile of Object.values(next.marketPiles)) {
      expect(pile.cards).not.toContain(chosen);
    }
    // The coin itself stays trashed.
    expect(next.removed).toContain(id);
  });

  it('raises no prompt when nothing in the Resource Area is cheap enough', () => {
    const base = game();
    const expensiveId = 'we-006#expensive';
    const cards = {
      ...base.cards,
      [expensiveId]: {
        instanceId: expensiveId,
        cardId: 'we-006',
        location: { zone: 'marketPile' as const, index: 0, pileId: 'expensive' },
      },
    };
    const stripped: GameState = {
      ...base,
      cards,
      marketPiles: { expensive: { pileId: 'expensive', cards: [expensiveId] } },
    };
    const { state, id } = addCard(stripped, 0, COIN);
    const after = applyAction(state, { type: 'playItem', seat: 0, instanceId: id });
    expect(after.removed).toContain(id);
    expect(after.prompts.some(p => p.payload?.kind === 'antiqueCoinChooseWeapon')).toBe(false);
  });

  it('comes out of the Mansion: exploring it offers Take, and Take gains it', () => {
    const { state, id } = putOnMansionTop(game({ exploresLeft: 3 }), COIN);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });

    const take = revealed.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    expect(take).toBeDefined();
    if (take === undefined) return;
    expect(take.payload?.instanceId).toBe(id);

    const taken = answer(revealed, 'takeOrBottom', 0);
    expect(taken.seats[0]?.discard).toContain(id);
    expect(taken.mansionDeck).not.toContain(id);
  });

  it('a taken coin can be played for a weapon', () => {
    const { state, id } = putOnMansionTop(game({ exploresLeft: 3 }), COIN);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const revealed = applyAction(armed, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    const taken = answer(revealed, 'takeOrBottom', 0);

    // Move the gained coin from the discard into hand (a later draw would).
    const hand = [...(taken.seats[0]?.hand ?? []), id];
    const discard = (taken.seats[0]?.discard ?? []).filter(x => x !== id);
    const ready: GameState = {
      ...taken,
      seats: taken.seats.map((p, i) => (i === 0 ? { ...p, hand, discard } : p)),
      cards: { ...taken.cards, [id]: { instanceId: id, cardId: COIN, location: { zone: 'hand', index: 0, seat: 0 } } },
    };

    const after = playCoin(ready);
    expect(after.removed).toContain(id);
    expect(after.prompts.some(p => p.payload?.kind === 'antiqueCoinChooseWeapon')).toBe(true);
  });
});
