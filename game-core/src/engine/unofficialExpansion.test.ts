import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState, Prompt } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { playBotGame } from '../ai/sim';
import { CUSTOM_CARDS } from '../data/custom';
import {
  PREMIER_CARDS,
  FIRST_TIMER_PILES,
  STANDARD_MANSION_DECK,
  cardsForScenario,
  pilesForScenario,
} from '../data/cards';

/**
 * Unofficial Expansion 1 (EX-001..EX-009) — Manny's fan-designed sheet.
 * Rulings encoded here (2026-11-09):
 *  - [STORAGE]/[BOX] cards are mansion TOKENS.
 *  - EX-002 attaches on gain and auto-defeats the next Infected with 80+ Health
 *    revealed while exploring, then is removed from the game.
 *  - EX-005 grants +50 Ammo AND +50 Gold.
 *  - EX-007 returns to its OWN market pile (reusable).
 *  - EX-009 is a shared-supply counter; it returns there when the Character dies.
 */

const IDS = ['ex-001', 'ex-002', 'ex-003', 'ex-004', 'ex-005', 'ex-006', 'ex-007', 'ex-008', 'ex-009'] as const;

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-002' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    cardsForScenario('firstTimer', { customCards: IDS }),
    pilesForScenario('firstTimer', { customCards: IDS }),
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;

/** Register a card instance in a seat zone (hand by default). */
function addCard(s: GameState, seat: number, cardId: string, zone: 'hand' | 'discard' = 'hand'): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0 } } };
  const seats = s.seats.map((p, i) => {
    if (i !== seat) return p;
    return zone === 'hand' ? { ...p, hand: [...p.hand, id] } : { ...p, discard: [...p.discard, id] };
  });
  return { state: { ...s, cards, seats }, id };
}

/** Put the given cards on top of the Mansion, first id first. */
function setMansionTop(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    cards[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck', index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

function answer(s: GameState, kind: string, option: number): GameState {
  const prompt: Prompt | undefined = s.prompts.find(p => p.payload?.kind === kind);
  if (prompt === undefined) throw new Error(`no ${kind} prompt (have: ${s.prompts.map(p => p.payload?.kind).join(',')})`);
  return applyAction(s, { type: 'chooseOption', seat: prompt.seat, promptId: prompt.id, option });
}

/** Explore the top Mansion card with the given weapon instance. */
function exploreWith(s: GameState, weaponId: string): GameState {
  return applyAction(s, { type: 'explore', seat: 0, weapons: [weaponId], exploreCount: 1 });
}

describe('Unofficial Expansion data', () => {
  it('defines all nine cards with the printed stats', () => {
    const byId = new Map(CUSTOM_CARDS.map(c => [c.id, c]));
    expect(byId.get('ex-001')).toEqual(expect.objectContaining({ name: 'Special Rocket Launcher Case', type: 'token', copies: 1 }));
    expect(byId.get('ex-002')).toEqual(expect.objectContaining({ name: 'Special Rocket Launcher', type: 'weapon', cost: 130, damage: 0, ammoReq: 0 }));
    expect(byId.get('ex-003')).toEqual(expect.objectContaining({ name: 'Weapon Case', type: 'token', copies: 1 }));
    expect(byId.get('ex-004')).toEqual(expect.objectContaining({ name: 'Ammunition Box', type: 'token', copies: 1 }));
    expect(byId.get('ex-005')).toEqual(expect.objectContaining({ name: 'Ammo x50', type: 'ammunition', cost: 90, bonuses: { ammo: 50, gold: 50 } }));
    expect(byId.get('ex-006')).toEqual(expect.objectContaining({ name: 'Web Spinner', type: 'infected', hp: 35, attack: 10, decorations: 3, copies: 2 }));
    expect(byId.get('ex-007')).toEqual(expect.objectContaining({ name: 'Blue Herb', type: 'item', cost: 20 }));
    expect(byId.get('ex-008')).toEqual(expect.objectContaining({ name: 'Yawn', type: 'infected', hp: 50, attack: 20, decorations: 5, copies: 2 }));
    expect(byId.get('ex-009')).toEqual(expect.objectContaining({ name: 'Poison', type: 'counter', copies: 5 }));
  });

  it('pulls the Poison counter in when an infected that needs it is selected', () => {
    const on = cardsForScenario('firstTimer', { customCards: ['ex-006'] });
    expect(on.some(c => c.id === 'ex-006')).toBe(true);
    expect(on.some(c => c.id === 'ex-009')).toBe(true);
    // ...and keeps it out when nothing references it.
    const off = cardsForScenario('firstTimer', { customCards: ['ex-001'] });
    expect(off.some(c => c.id === 'ex-009')).toBe(false);
  });

  it('the Poison lobby option enables the whole bundle with one check', () => {
    const on = cardsForScenario('firstTimer', { customCards: ['poison'] });
    for (const id of ['ex-006', 'ex-007', 'ex-008', 'ex-009']) {
      expect(on.some(c => c.id === id), id).toBe(true);
    }
    const piles = pilesForScenario('firstTimer', { customCards: ['poison'] });
    expect(piles.map(p => p.pileId)).toContain('custom-ex-007');
    // Not selected -> none of the bundle reaches the game.
    const offCards = cardsForScenario('firstTimer', { customCards: ['ex-001'] });
    expect(offCards.some(c => c.id === 'ex-009')).toBe(false);
    const offPiles = pilesForScenario('firstTimer', { customCards: ['ex-001'] });
    expect(offPiles.map(p => p.pileId)).not.toContain('custom-ex-007');
  });

  it('gives the cost-bearing customs their own market piles, and never piles the counter', () => {
    const piles = pilesForScenario('firstTimer', { customCards: IDS });
    const pileIds = piles.map(p => p.pileId);
    expect(pileIds).toContain('custom-ex-002');
    expect(pileIds).toContain('custom-ex-005');
    expect(pileIds).toContain('custom-ex-007');
    expect(pileIds).not.toContain('custom-ex-009');
    expect(pileIds).not.toContain('custom-ex-001');
  });

  it('shuffles the custom mansion cards in and seeds the shared counter supply', () => {
    const s = game();
    const mansion = [...s.mansionDeck];
    expect(mansion.filter(id => s.cards[id]?.cardId === 'ex-001')).toHaveLength(1);
    expect(mansion.filter(id => s.cards[id]?.cardId === 'ex-003')).toHaveLength(1);
    expect(mansion.filter(id => s.cards[id]?.cardId === 'ex-004')).toHaveLength(1);
    expect(mansion.filter(id => s.cards[id]?.cardId === 'ex-006')).toHaveLength(2);
    expect(mansion.filter(id => s.cards[id]?.cardId === 'ex-008')).toHaveLength(2);
    // Five Poison counters seed the shared supply (Manny's ruling).
    expect(s.supply?.filter(id => s.cards[id]?.cardId === 'ex-009')).toHaveLength(5);
    // The Poison bundle stacks FIVE Blue Herbs in the Resource Area.
    expect(s.marketPiles['custom-ex-007']?.cards).toHaveLength(5);
  });

  it('the Poison bundle alone seeds 2+2 Infected, a 5-card herb stack and the counter', () => {
    const s = setup(
      {
        seed: 11,
        players: [
          { name: 'P', controller: 'human', characterCardId: 'ch-002' },
          { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
        ],
      },
      cardsForScenario('firstTimer', { customCards: ['poison'] }),
      pilesForScenario('firstTimer', { customCards: ['poison'] }),
      STANDARD_MANSION_DECK,
    );
    const mansion = [...s.mansionDeck];
    expect(mansion.filter(id => s.cards[id]?.cardId === 'ex-006')).toHaveLength(2);
    expect(mansion.filter(id => s.cards[id]?.cardId === 'ex-008')).toHaveLength(2);
    expect(s.marketPiles['custom-ex-007']?.cards).toHaveLength(5);
    expect(s.supply?.filter(id => s.cards[id]?.cardId === 'ex-009')).toHaveLength(5);
  });
});

describe('EX-001 Special Rocket Launcher Case', () => {
  it('grants the Special Rocket Launcher (attached) and removes itself', () => {
    const { state, ids } = setMansionTop(game({ exploresLeft: 3 }), ['ex-001']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const revealed = exploreWith(armed, knife);
    const taken = answer(revealed, 'takeOrBottom', 0);
    expect(taken.removed).toContain(ids[0]);
    const launcher = taken.seats[0]?.attached.find(a => taken.cards[a]?.cardId === 'ex-002');
    expect(launcher).toBeDefined();
  });
});

describe('EX-002 Special Rocket Launcher', () => {
  it('auto-defeats the next Infected with 80+ Health revealed while exploring, then is removed', () => {
    const { state, ids } = setMansionTop(game({ exploresLeft: 5, hp: 80 }), ['ex-001']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const withLauncher = answer(exploreWith(armed, knife), 'takeOrBottom', 0);
    const launcherId = withLauncher.seats[0]?.attached.find(a => withLauncher.cards[a]?.cardId === 'ex-002');
    expect(launcherId).toBeDefined();

    const { state: bossState, ids: bossIds } = setMansionTop(withLauncher, ['ma-010']);
    const { state: armed2, id: knife2 } = addCard(bossState, 0, 'we-004');
    const next = exploreWith(armed2, knife2);

    // Uroboros Aheri (90 Health, 70 Damage) is defeated immediately: no damage.
    expect(next.seats[0]?.hp).toBe(80);
    expect(next.seats[0]?.attached).toContain(bossIds[0]);
    expect(next.seats[0]?.decorations).toBe(8);
    // The launcher left the Character and the game.
    expect(next.seats[0]?.attached).not.toContain(launcherId);
    expect(next.removed).toContain(launcherId);
  });

  it('auto-defeats the qualifying Infected inside a MULTI-explore batch', () => {
    const { state } = setMansionTop(game({ exploresLeft: 5, hp: 80 }), ['ex-001']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const withLauncher = answer(exploreWith(armed, knife), 'takeOrBottom', 0);
    const launcherId = withLauncher.seats[0]?.attached.find(a => withLauncher.cards[a]?.cardId === 'ex-002');

    const { state: batchState, ids: batchIds } = setMansionTop(withLauncher, ['ma-010', 'ma-006']);
    const { state: armed2, id: knife2 } = addCard(batchState, 0, 'we-004');
    const next = applyAction(armed2, { type: 'explore', seat: 0, weapons: [knife2], exploreCount: 2 });

    // ma-010 is auto-defeated (no damage from it); ma-006 (40/30) is not
    // defeated by 10 damage, so its 30 Damage lands.
    expect(next.seats[0]?.hp).toBe(50);
    expect(next.seats[0]?.attached).toContain(batchIds[0]);
    expect(next.seats[0]?.attached).not.toContain(batchIds[1]);
    expect(next.seats[0]?.attached).not.toContain(launcherId);
    expect(next.removed).toContain(launcherId);
  });

  it('does not fire on an Infected below the threshold', () => {
    const { state } = setMansionTop(game({ exploresLeft: 5, hp: 80 }), ['ex-001']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const withLauncher = answer(exploreWith(armed, knife), 'takeOrBottom', 0);
    const { state: weakState, ids: weakIds } = setMansionTop(withLauncher, ['ma-006']);
    const { state: armed2, id: knife2 } = addCard(weakState, 0, 'we-004');
    const next = exploreWith(armed2, knife2);
    const launcherId = withLauncher.seats[0]?.attached.find(a => withLauncher.cards[a]?.cardId === 'ex-002');
    // ma-006 (40 Health / 30 Damage) is not auto-defeated by a 10-damage knife.
    expect(next.seats[0]?.hp).toBe(50);
    expect(next.seats[0]?.attached).not.toContain(weakIds[0]);
    expect(next.removed).not.toContain(launcherId);
  });
});

describe('EX-003 Weapon Case', () => {
  it('offers every Resource Area weapon, moves the chosen one to the discard, removes itself', () => {
    const { state, ids } = setMansionTop(game({ exploresLeft: 3 }), ['ex-003']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const revealed = exploreWith(armed, knife);
    const taken = answer(revealed, 'takeOrBottom', 0);
    const prompt = taken.prompts.find(p => p.payload?.kind === 'weaponCaseChooseWeapon');
    expect(prompt).toBeDefined();
    expect(prompt?.options.length).toBeGreaterThan(1);

    const chosen = prompt?.options[0] as string;
    const next = answer(taken, 'weaponCaseChooseWeapon', 0);
    expect(next.removed).toContain(ids[0]);
    expect(next.seats[0]?.discard).toContain(chosen);
    // It left its market pile.
    for (const pile of Object.values(next.marketPiles)) {
      expect(pile.cards).not.toContain(chosen);
    }
  });
});

describe('EX-004 Ammunition Box', () => {
  it('grants an Ammo x50 and removes itself', () => {
    const { state, ids } = setMansionTop(game({ exploresLeft: 3 }), ['ex-004']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const taken = answer(exploreWith(armed, knife), 'takeOrBottom', 0);
    expect(taken.removed).toContain(ids[0]);
    expect(taken.seats[0]?.discard.some(id => taken.cards[id]?.cardId === 'ex-005')).toBe(true);
  });
});

describe('EX-005 Ammo x50', () => {
  it('grants +50 Ammo and +50 Gold', () => {
    const s = game();
    const { state, id } = addCard(s, 0, 'ex-005');
    const next = applyAction(state, { type: 'playAmmo', seat: 0, instanceId: id });
    expect(next.seats[0]?.turnAmmo).toBe(50);
    expect(next.seats[0]?.turnGold).toBe(50);
  });
});

describe('EX-006 / EX-008 Poison counters', () => {
  it('attaches a Poison counter to the exploring Character when not defeated', () => {
    const { state } = setMansionTop(game({ exploresLeft: 3, hp: 80, turnAmmo: 0 }), ['ex-006']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const next = exploreWith(armed, knife);
    const counter = next.seats[0]?.counters?.find(c => next.cards[c]?.cardId === 'ex-009');
    expect(counter).toBeDefined();
    expect(next.supply).not.toContain(counter);
  });

  it('attaches a counter from a MULTI-explore batch as well', () => {
    const { state } = setMansionTop(game({ exploresLeft: 4, hp: 80, turnAmmo: 0 }), ['ex-006', 'ex-008']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 2 });
    // Combined 35 + 50 = 85 Health > 10 damage: neither is defeated, but the
    // "maximum of one" rule means only a single Poison counter is attached.
    expect((next.seats[0]?.counters ?? []).filter(c => next.cards[c]?.cardId === 'ex-009')).toHaveLength(1);
  });

  it('attaches at most one Poison per Character (the printed maximum)', () => {
    const s = game({ hp: 80, turnAmmo: 0 });
    const withCounter: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, counters: ['ex-009#1'] } : p)),
      supply: (s.supply ?? []).filter(id => id !== 'ex-009#1'),
    };
    const { state } = setMansionTop(withCounter, ['ex-006']);
    const { state: armed, id: knife } = addCard(state, 0, 'we-004');
    const next = exploreWith(armed, knife);
    expect((next.seats[0]?.counters ?? []).filter(c => next.cards[c]?.cardId === 'ex-009')).toHaveLength(1);
  });
  it('five counters let two Characters be poisoned at the same time', () => {
    // Manny's ruling (2026-11-12): the bundle ships FIVE Poison cards, so more
    // than one Character at the table can carry a counter.
    let s = game({ hp: 80, maxHp: 80 });
    s = setMansionTop(s, ['ex-006']).state;
    const k0 = addCard(s, 0, 'we-004');
    s = exploreWith(k0.state, k0.id);
    expect((s.seats[0]?.counters ?? []).length).toBe(1);
    expect(s.supply?.length).toBe(4);
    // Pass the turn: the second seat explores into Yawn and is poisoned too.
    s = startTurn(applyAction(s, { type: 'endTurn', seat: 0 }));
    s = setMansionTop(s, ['ex-008']).state;
    const k1 = addCard(s, 1, 'we-004');
    s = applyAction(k1.state, { type: 'explore', seat: 1, weapons: [k1.id], exploreCount: 1 });
    expect((s.seats[0]?.counters ?? []).length).toBe(1);
    expect((s.seats[1]?.counters ?? []).length).toBe(1);
    expect(s.supply?.length).toBe(3);
    // ...and each takes its own 5 damage at its own turn start.
    const hpBefore = s.seats[0]?.hp;
    s = startTurn(applyAction(s, { type: 'endTurn', seat: 1 }));
    expect(s.seats[0]?.hp).toBe((hpBefore ?? 0) - 5);
  });
});

describe('EX-009 Poison', () => {
  it('deals 5 damage at the beginning of the attached Character\'s turn', () => {
    const s = game({ hp: 50, maxHp: 50 });
    const withCounter: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, counters: ['ex-009#1'] } : p)),
      supply: (s.supply ?? []).filter(id => id !== 'ex-009#1'),
    };
    const next = startTurn(withCounter);
    expect(next.seats[0]?.hp).toBe(45);
  });

  it('downs the Character when the damage is lethal', () => {
    const s = game({ hp: 5, maxHp: 50 });
    const withCounter: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, counters: ['ex-009#1'] } : p)),
      supply: (s.supply ?? []).filter(id => id !== 'ex-009#1'),
    };
    const next = startTurn(withCounter);
    expect(next.seats[0]?.downed).toBe(true);
    expect(next.seats[0]?.hp).toBe(0);
  });

  it('returns to the shared supply when the Character dies', () => {
    const s = game({ hp: 0, maxHp: 20, downed: true, counters: ['ex-009#1'], hand: [], discard: [], inventory: [] });
    const next = startTurn(s);
    expect(next.seats[0]?.dead).toBe(true);
    expect(next.supply).toContain('ex-009#1');
    expect(next.seats[0]?.counters ?? []).not.toContain('ex-009#1');
  });
});

describe('EX-007 Blue Herb', () => {
  it('removes every Poison counter and returns to its own market pile', () => {
    const s = game({ hp: 40, maxHp: 50 });
    const withCounter: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, counters: ['ex-009#1'] } : p)),
      supply: (s.supply ?? []).filter(id => id !== 'ex-009#1'),
    };
    const { state, id } = addCard(withCounter, 0, 'ex-007');
    const next = applyAction(state, { type: 'playItem', seat: 0, instanceId: id });
    expect(next.seats[0]?.counters ?? []).toHaveLength(0);
    expect(next.supply).toContain('ex-009#1');
    expect(next.removed).not.toContain(id);
    const pile = Object.values(next.marketPiles).find(p => p.pileId === 'custom-ex-007');
    expect(pile?.cards[0]).toBe(id);
  });

  it('still returns to its own pile after that single-card pile has been emptied', () => {
    const s = game();
    const emptied: GameState = {
      ...s,
      marketPiles: Object.fromEntries(
        Object.entries(s.marketPiles).map(([pid, p]) => [
          pid,
          { ...p, cards: p.cards.filter(id => s.cards[id]?.cardId !== 'ex-007') },
        ]),
      ),
    };
    const { state, id } = addCard(emptied, 0, 'ex-007');
    const next = applyAction(state, { type: 'playItem', seat: 0, instanceId: id });
    const pile = Object.values(next.marketPiles).find(p => p.pileId === 'custom-ex-007');
    expect(pile?.cards[0]).toBe(id);
    expect(next.removed).not.toContain(id);
  });
});

describe('Unofficial Expansion in a full bot game', () => {
  /** Every instance id placed in a zone (characters live outside zones). */
  function zoneInstanceIds(state: GameState): string[] {
    const ids: string[] = [];
    for (const seat of state.seats) {
      ids.push(...seat.hand, ...seat.inventory, ...seat.discard, ...seat.playArea, ...seat.attached, ...(seat.counters ?? []), ...(seat.infectionCards ?? []), ...(seat.partnerAttached ?? []));
    }
    for (const pile of Object.values(state.marketPiles)) ids.push(...pile.cards);
    ids.push(...state.mansionDeck);
    ids.push(...(state.infectionDeck ?? []));
    ids.push(...(state.supply ?? []));
    return ids;
  }

  it('conserves every instance and cycles the counter supply across full games', () => {
    for (const seed of [1, 2, 3]) {
      const res = playBotGame({
        seed,
        difficulties: ['hard', 'hard', 'hard', 'hard'],
        maxActions: 4000,
        scenario: 'firstTimer',
        cards: cardsForScenario('firstTimer', { customCards: IDS }),
        piles: pilesForScenario('firstTimer', { customCards: IDS }),
        mansionCards: STANDARD_MANSION_DECK,
      });
      expect(res.ended).toBe('gameOver');
      const zones = zoneInstanceIds(res.state);
      expect(new Set(zones).size, `seed ${seed}: duplicate zone placement`).toBe(zones.length);
      const zoneSet = new Set(zones);
      for (const id of zoneSet) expect(res.state.cards[id], `seed ${seed}: ${id} not registered`).toBeDefined();
      const characters = new Set(
        Object.values(res.state.cards)
          .filter(ci => res.state.cardDefs[ci.cardId]?.type === 'character')
          .map(ci => ci.instanceId),
      );
      const union = new Set([...zoneSet, ...res.state.removed, ...characters]);
      const registered = new Set(Object.keys(res.state.cards));
      expect([...registered].filter(id => !union.has(id)), `seed ${seed}: orphan`).toEqual([]);
      expect(union.size, `seed ${seed}: union vs registered`).toBe(registered.size);
      // A counter is either in the shared supply or attached — never both.
      const attached = res.state.seats.flatMap(s => s.counters ?? []);
      for (const id of attached) {
        expect(res.state.supply ?? [], `seed ${seed}: ${id} in two places`).not.toContain(id);
        expect(res.state.cards[id]?.cardId).toBe('ex-009');
      }
    }
  });
});
