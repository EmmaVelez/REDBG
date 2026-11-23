import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { MERCENARIES_CARDS } from '../data/mercenaries';
import { MERCENARIES_PILES, MERCENARIES_MANSION } from '../data/cards';

/**
 * CH-049 ALBERT WESKER (Mercenaries) L1: "When Albert would take any damage
 * while exploring, you may lower that damage by 10 for every card in your hand."
 *
 * Same hold-and-settle mechanism as CH-045 (`settleHeldDamageLoss`), with no
 * printed cost — accepting only lowers the loss.
 */

let counter = 0;
const nextId = (cardId: string) => `${cardId}#we${++counter}`;

function mercGame(over: Partial<PlayerState> = {}, mainId = 'ch-049', foeId = 'ch-046'): GameState {
  const s = setup(
    {
      seed: 5,
      players: [
        { name: 'Hero', controller: 'human', characterCardId: mainId },
        { name: 'Foe', controller: 'human', characterCardId: foeId },
      ],
    },
    MERCENARIES_CARDS,
    MERCENARIES_PILES,
    MERCENARIES_MANSION,
  );
  const st = startTurn(s);
  return { ...st, seats: st.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function addCard(s: GameState, seat: number, cardId: string, zone: 'hand' | 'discard' | 'playArea' = 'hand'): { state: GameState; id: string } {
  const id = nextId(cardId);
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } },
      seats: s.seats.map((p, i) => (i !== seat ? p : zone === 'hand'
        ? { ...p, hand: [...p.hand, id] }
        : zone === 'playArea' ? { ...p, playArea: [...p.playArea, id] } : { ...p, discard: [...p.discard, id] })),
    },
    id,
  };
}

function stackMansion(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = nextId(c);
    (cards as Record<string, unknown>)[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck', index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards: cards as GameState['cards'], mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

function findHand(s: GameState, cardId: string, seat = 0): string {
  const id = (s.seats[seat]?.hand ?? []).find(hid => s.cards[hid]?.cardId === cardId);
  if (id === undefined) throw new Error(`card ${cardId} not in hand of seat ${seat}`);
  return id;
}

/** ma-078 Red Executioner: HP 80, attack 60 — survives a Reliable Blade hit. */
function rigExplore(over: Partial<PlayerState> = {}) {
  let s: GameState = mercGame({ level: 1, hp: 110, actionsLeft: 3, exploresLeft: 2, ...over });
  const extra = addCard(s, 0, 'am-005'); // hand becomes 5 cards after the weapon leaves -> -50
  s = extra.state;
  const w = { id: findHand(s, 'we-050') };
  const top = stackMansion(s, ['ma-078']);
  s = top.state;
  const explored = applyAction({ ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 200 } : p)) }, {
    type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1,
  });
  return { explored, revealedId: top.ids[0]! };
}

const weskerPrompt = (s: GameState) => s.prompts.find(p => p.payload?.kind === 'weskerDamageReduction');

describe('CH-049 Wesker L1 — explore damage reduction is a choice', () => {
  it('holds the damage and offers -10 per card in hand', () => {
    const { explored } = rigExplore();
    expect(explored.seats[0]?.hp).toBe(110); // held at pre-damage Health
    const pr = weskerPrompt(explored);
    expect(pr).toBeDefined();
    expect(pr?.payload?.loss).toBe('60');
    expect(pr?.payload?.amount).toBe('50'); // 5 cards x 10
  });

  it('accepting applies only the reduced loss', () => {
    const { explored } = rigExplore();
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: weskerPrompt(explored)!.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(100); // 110 - (60 - 50)
    expect(weskerPrompt(out)).toBeUndefined();
  });

  it('declining applies the full loss', () => {
    const { explored } = rigExplore();
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: weskerPrompt(explored)!.id, option: 1 });
    expect(out.seats[0]?.hp).toBe(50); // 110 - 60
  });

  it('a declined lethal hit still downs him', () => {
    const { explored } = rigExplore({ hp: 60 });
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: weskerPrompt(explored)!.id, option: 1 });
    expect(out.seats[0]?.hp).toBe(0);
    expect(out.seats[0]?.downed).toBe(true);
  });

  it('accepting a lethal hit leaves him alive at the reduced total', () => {
    const { explored } = rigExplore({ hp: 60 });
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: weskerPrompt(explored)!.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(50); // 60 - 10
    expect(out.seats[0]?.downed).toBeFalsy();
  });

  it('also holds in a multi-explore, and can absorb the whole combined hit', () => {
    let s: GameState = mercGame({ level: 1, hp: 110, exploresLeft: 2 });
    const extra = addCard(s, 0, 'am-005');
    s = extra.state;
    const w = { id: findHand(s, 'we-050') };
    const top = stackMansion(s, ['ma-079', 'ma-079']); // 2 x attack 20
    s = top.state;
    const explored = applyAction({ ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 200 } : p)) }, {
      type: 'explore', seat: 0, weapons: [w.id], exploreCount: 2,
    });
    const pr = weskerPrompt(explored);
    expect(pr).toBeDefined();
    expect(pr?.payload?.loss).toBe('40');
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr!.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(110); // -50 covers the whole 40
  });

  it('is not offered when Wesker is not the one taking the damage', () => {
    let s: GameState = mercGame({ level: 1, hp: 110, exploresLeft: 2 }, 'ch-046', 'ch-044');
    const w = addCard(s, 0, 'we-050');
    s = w.state;
    const top = stackMansion(s, ['ma-078']);
    s = top.state;
    const explored = applyAction({ ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 200 } : p)) }, {
      type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1,
    });
    expect(explored.seats[0]?.hp).toBe(50); // full 60, no hold
    expect(weskerPrompt(explored)).toBeUndefined();
  });
});
