import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { locationInfectedHpBonus, applyPostTurnCleanup } from './locations';

/** Fan Locations batch 5: loc-018 Art Supply Room, loc-019 Armor Room,
 *  loc-020 Attic Landing, loc-021 Attic. */

const NEW_IDS = ['loc-018', 'loc-019', 'loc-020', 'loc-021'] as const;

let counter = 0;

function game(over: Partial<PlayerState> = {}, seats = 2): GameState {
  const players = Array.from({ length: seats }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? 'ch-002' : 'ch-001',
  }));
  const s = setup(
    { seed: 11, players, locationsMode: true },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function onlyLocation(s: GameState, cardId: string): GameState {
  const id = `${cardId}#only${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } } as GameState['cards'];
  return { ...s, cards, locationDeck: [id], locations: [] };
}

function revealAndAck(s: GameState, cardId: string, ackFrom = 0): GameState {
  let out = onlyLocation(s, cardId);
  out = applyAction(out, { type: 'explore', seat: ackFrom, weapons: [], exploreCount: 1 });
  for (let guard = 0; guard < 20 && out.prompts.length > 0; guard++) {
    const p = out.prompts[0];
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

function revealFor(s: GameState, cardId: string, seat: number): GameState {
  return revealAndAck({ ...s, seats: s.seats.map((p, i) => (i === seat ? { ...p, exploresLeft: 2 } : p)) }, cardId, seat);
}

function defOf(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

describe('Locations batch 5 — data', () => {
  it('defines all four with the printed kind and cost', () => {
    expect(defOf('loc-018')).toEqual(expect.objectContaining({ id: 'loc-018', name: 'Art Supply Room', locationKind: 'onex', locationCost: 60, locationMaxPerTurn: 1 }));
    expect(defOf('loc-019')).toEqual(expect.objectContaining({ id: 'loc-019', name: 'Armor Room', locationKind: 'onex', locationCost: 60 }));
    expect(defOf('loc-020')).toEqual(expect.objectContaining({ id: 'loc-020', name: 'Attic Landing', locationKind: 'onex', locationCost: 20 }));
    expect(defOf('loc-021')).toEqual(expect.objectContaining({ id: 'loc-021', name: 'Attic', locationKind: 'onex', locationCost: 10 }));
  });

  it('ships card art for all four', () => {
    for (const id of NEW_IDS) {
      const p = `src/data/CARD-ART/${id.toUpperCase()}.png`;
      expect(existsSync(p), p).toBe(true);
    }
  });

  it('keeps the ids unique', () => {
    for (const id of NEW_IDS) expect(CUSTOM_CARDS.filter(c => c.id === id)).toHaveLength(1);
  });
});

describe('Attic Landing — +1 Buy, a 20 ammo, and tougher Infected', () => {
  it('charges the 1X cost and grants the buy + the ammo card bonus', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    s = revealFor(s, 'loc-020', 0);
    const goldBefore = (s.seats[0] as PlayerState).turnGold;
    const ammoBefore = (s.seats[0] as PlayerState).turnAmmo;
    const out = applyAction(s, {
      type: 'useLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId,
    });
    const seat = out.seats[0] as PlayerState;
    // -20 for the 1X use, then the Ammo x20's own +20 Gold bonus.
    expect(seat.turnGold).toBe(goldBefore);
    expect(seat.discard.some(id => s.cards[id]?.cardId === 'am-002')).toBe(true);
    expect(seat.buysLeft).toBe(2);          // -1 for the use, +1 from the card
    expect(seat.turnAmmo).toBe(ammoBefore + 20);
  });

  it('On Reveal gives Infected +10 Health this turn', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = revealFor(s, 'loc-020', 0);
    expect(locationInfectedHpBonus(s)).toBe(10);
    // ...and it expires at the next turn boundary.
    const next = startTurn(applyAction(s, { type: 'endTurn', seat: 0 }));
    expect(locationInfectedHpBonus(next)).toBe(0);
  });
});

describe('Armor Room — look through the discard', () => {
  it('moves one ammo, one action and one weapon to the top of the Inventory', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    // Put one of each in seat 0's discard.
    const mk = (cardId: string) => {
      const id = `${cardId}#armor${++counter}`;
      s = {
        ...s,
        cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'discard', index: 0, seat: 0 } } } as GameState['cards'],
        seats: s.seats.map((p, i) => (i === 0 ? { ...p, discard: [...p.discard, id] } : p)),
      };
      return id;
    };
    const ammo = mk('am-002');
    const action = mk('ac-001');
    const weapon = mk('we-004');
    s = revealFor(s, 'loc-019', 0);
    const xpBefore = (s.seats[0] as PlayerState).xp ?? 0;
    const out = applyAction(s, {
      type: 'useLocation', seat: 0, instanceId: (s.locations ?? [])[0]!.instanceId,
    });
    const seat = out.seats[0] as PlayerState;
    expect(seat.discard).not.toContain(ammo);
    expect(seat.discard).not.toContain(action);
    expect(seat.discard).not.toContain(weapon);
    expect(seat.inventory.slice(0, 3).sort()).toEqual([ammo, action, weapon].sort());
    expect(seat.xp ?? 0).toBe(xpBefore + 1);
  });
});

describe('Attic — trash an action for a better one', () => {
  it('trashes a hand action and gains a market action into the hand', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    const trash = `ac-001#attic${++counter}`;
    s = {
      ...s,
      cards: { ...s.cards, [trash]: { instanceId: trash, cardId: 'ac-001', location: { zone: 'hand', index: 0, seat: 0 } } } as GameState['cards'],
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, trash] } : p)),
    };
    s = revealFor(s, 'loc-021', 0);
    const goldBefore = (s.seats[0] as PlayerState).turnGold;
    let out = applyAction(s, { type: 'atticStart', seat: 0 });
    expect((out.seats[0] as PlayerState).turnGold).toBe(goldBefore - 10);
    const trashPrompt = out.prompts.find(p => p.payload?.kind === 'atticActionChoice');
    expect(trashPrompt).toBeDefined();
    out = applyAction(out, { type: 'chooseOption', seat: 0, promptId: trashPrompt!.id, option: 0 });
    expect(out.removed).toContain(trash);
    const gainPrompt = out.prompts.find(p => p.payload?.kind === 'atticGainChoice');
    expect(gainPrompt).toBeDefined();
    const pick = gainPrompt!.options[0]!;
    out = applyAction(out, { type: 'chooseOption', seat: 0, promptId: gainPrompt!.id, option: 0 });
    const seat = out.seats[0] as PlayerState;
    expect(seat.hand).toContain(pick);
  });
});

describe('Art Supply Room — end-of-turn phase', () => {
  it('opens a real choice, trashes the picked cards, then starts the next turn', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    s = revealFor(s, 'loc-018', 0);
    const inst = (s.locations ?? [])[0]!.instanceId;
    const used = applyAction(s, { type: 'useLocation', seat: 0, instanceId: inst });
    expect((used.seats[0] as PlayerState).locationUsesThisTurn).toContain(inst);

    const ended = applyAction(used, { type: 'endTurn', seat: 0 });
    // The turn does NOT advance: the seat is parked in the end-of-turn phase.
    expect(ended.activeSeat).toBe(1);
    expect(ended.pendingEndPhaseSeat).toBe(0);
    const prompt = ended.prompts.find(p => p.payload?.kind === 'postTurnTrashChoice');
    expect(prompt).toBeDefined();
    expect(prompt!.options).toContain('Done');

    // Trash one card, then finish.
    const hand = (ended.seats[0] as PlayerState).hand;
    const pick = hand[0]!;
    const afterPick = applyAction(ended, { type: 'postTurnTrashChoose', seat: 0, instanceId: pick });
    expect(afterPick.postTurnTrashIds).toEqual([pick]);
    expect(afterPick.removed).toContain(pick);
    expect(afterPick.pendingEndPhaseSeat).toBe(0);

    const done = applyAction(afterPick, { type: 'postTurnTrashChoose', seat: 0, instanceId: 'Done' });
    expect(done.pendingEndPhaseSeat).toBeUndefined();
    expect(done.postTurnTrashIds).toBeUndefined();
    // The wrapper hands off to the next turn.
    expect(done.activeSeat).toBe(1);
    const doneSeat0 = done.seats[0] as PlayerState;
    expect(doneSeat0.hand.length + doneSeat0.inventory.length + doneSeat0.discard.length)
      .toBe(hand.length + (ended.seats[0] as PlayerState).inventory.length + (ended.seats[0] as PlayerState).discard.length - 1);
  });

  it('resolves immediately on Done, trashing nothing', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    s = revealFor(s, 'loc-018', 0);
    const inst = (s.locations ?? [])[0]!.instanceId;
    const used = applyAction(s, { type: 'useLocation', seat: 0, instanceId: inst });
    const ended = applyAction(used, { type: 'endTurn', seat: 0 });
    const done = applyAction(ended, { type: 'postTurnTrashChoose', seat: 0, instanceId: 'Done' });
    expect(done.postTurnTrashIds).toBeUndefined();
    expect(done.removed).toHaveLength(ended.removed.length);
  });

  it('cannot be answered by a seat that is not in the phase', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 2, actionsLeft: 3 });
    s = revealFor(s, 'loc-018', 0);
    const inst = (s.locations ?? [])[0]!.instanceId;
    const used = applyAction(s, { type: 'useLocation', seat: 0, instanceId: inst });
    const ended = applyAction(used, { type: 'endTurn', seat: 0 });
    expect(() => applyAction(ended, { type: 'postTurnTrashChoose', seat: 1, instanceId: 'Done' }))
      .toThrow(/not the end-phase seat/);
  });
});
