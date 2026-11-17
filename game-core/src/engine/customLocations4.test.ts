import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { hasFreeActionRepeat } from './locations';

/** Fan Locations batch 4: loc-016 Trevor's Tomb, loc-017 Underground Passage. */

const NEW_IDS = ['loc-016', 'loc-017'] as const;

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

function revealAndAck(s: GameState, cardId: string): GameState {
  let out = onlyLocation(s, cardId);
  out = applyAction(out, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
  for (let guard = 0; guard < 20 && out.prompts.length > 0; guard++) {
    const p = out.prompts[0];
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

/** Reveal + invest seat 0 (enough gold for the cube and the buys under test). */
function invest(s: GameState, cardId: string): GameState {
  let out = revealAndAck({
    ...s,
    seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnGold: 400, buysLeft: 4 } : p)),
  }, cardId);
  out = applyAction(out, { type: 'investLocation', seat: 0, instanceId: (out.locations ?? [])[0]!.instanceId });
  return out;
}

function defOf(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

describe('Locations batch 4 — data', () => {
  it('defines both with the printed kind and cost', () => {
    expect(defOf('loc-016')).toEqual(expect.objectContaining({ id: 'loc-016', name: "Trevor's Tomb", locationKind: 'invest', locationCosts: [100] }));
    expect(defOf('loc-017')).toEqual(expect.objectContaining({ id: 'loc-017', name: 'Underground Passage', locationKind: 'onex', locationCost: 40 }));
  });

  it('ships card art for both', () => {
    for (const id of NEW_IDS) {
      const p = `src/data/CARD-ART/${id.toUpperCase()}.png`;
      expect(existsSync(p), p).toBe(true);
    }
  });

  it('keeps the ids unique', () => {
    for (const id of NEW_IDS) expect(CUSTOM_CARDS.filter(c => c.id === id)).toHaveLength(1);
  });
});

describe("Trevor's Tomb — free repeat", () => {
  it('replays the first action card played each turn, without spending an Action', () => {
    let s = game({ level: 1 });
    s = invest(s, 'loc-016');
    expect(hasFreeActionRepeat(s, 0)).toBe(true);
    // Seat 0 plays ac-001 (Mansion Foyer, +2 cards). The repeat should draw 2 more.
    const memo = `ac-001#tomb${++counter}`;
    s = {
      ...s,
      cards: { ...s.cards, [memo]: { instanceId: memo, cardId: 'ac-001', location: { zone: 'hand', index: 0, seat: 0 } } } as GameState['cards'],
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, memo] } : p)),
    };
    const before = (s.seats[0] as PlayerState).hand.length;
    const actionsBefore = (s.seats[0] as PlayerState).actionsLeft;
    const out = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: memo });
    const seat = out.seats[0] as PlayerState;
    // +2 from the play and +2 again from the free repeat.
    expect(seat.hand.length).toBe(before + 4 - 1);   // -1: the card left hand
    expect(seat.actionsLeft).toBe(actionsBefore - 1); // the repeat is free
  });

  it('only repeats the FIRST action of the turn', () => {
    let s = game({ level: 1, actionsLeft: 4, buysLeft: 4, turnGold: 400 });
    s = invest(s, 'loc-016');
    const mk = () => {
      const id = `ac-001#tomb2${++counter}`;
      s = {
        ...s,
        cards: { ...s.cards, [id]: { instanceId: id, cardId: 'ac-001', location: { zone: 'hand', index: 0, seat: 0 } } } as GameState['cards'],
        seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, id] } : p)),
      }
    };
    mk();
    const firstId = `ac-001#tomb2${counter}`;
    s = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: firstId });
    const afterFirst = (s.seats[0] as PlayerState).hand.length;
    mk();
    const secondId = `ac-001#tomb2${counter}`;
    const out = applyAction(s, { type: 'playActionCard', seat: 0, instanceId: secondId });
    // Only the normal +2 this time (the repeat was consumed by the first play).
    expect((out.seats[0] as PlayerState).hand.length).toBe(afterFirst + 1);
  });

  it('On Reveal lets a player pay 1 XP to remove an infection', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, xp: 3 } : p)) };
    // Give seat 0 an infection card.
    const inf = `in-001#tomb${++counter}`;
    s = {
      ...s,
      cards: { ...s.cards, [inf]: { instanceId: inf, cardId: 'in-001', location: { zone: 'skillArea', index: 0 } } } as GameState['cards'],
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, infectionCards: [inf] } : p)),
    };
    const revealed = applyAction(onlyLocation(s, 'loc-016'), { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    const offer = revealed.prompts.find(p => p.payload?.kind === 'locPayXpRemoveInfectionChoice');
    expect(offer).toBeDefined();
    const out = applyAction(revealed, { type: 'chooseOption', seat: offer!.seat, promptId: offer!.id, option: 0 });
    const seat = out.seats[offer!.seat] as PlayerState;
    expect(seat.xp ?? 0).toBe(2);
    expect(seat.infectionCards ?? []).not.toContain(inf);
  });
});

describe('Underground Passage — trash and upgrade', () => {
  it('trashes an action and sets the chosen replacement aside for next turn', () => {
    let s = game({ level: 1, turnGold: 200, buysLeft: 3 });
    s = revealAndAck(s, 'loc-017');
    // Seat 0 has ac-001 (cost 30) in hand to trash.
    const trash = `ac-001#pass${++counter}`;
    s = {
      ...s,
      cards: { ...s.cards, [trash]: { instanceId: trash, cardId: 'ac-001', location: { zone: 'hand', index: 0, seat: 0 } } } as GameState['cards'],
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, trash] } : p)),
    };
    const goldBefore = (s.seats[0] as PlayerState).turnGold;
    let out = applyAction(s, { type: 'passageStart', seat: 0 });
    // The 40 gold + 1 Buy were charged by the chain's start.
    expect((out.seats[0] as PlayerState).turnGold).toBe(goldBefore - 40);
    const trashPrompt = out.prompts.find(p => p.payload?.kind === 'passageActionChoice');
    expect(trashPrompt).toBeDefined();
    out = applyAction(out, { type: 'chooseOption', seat: 0, promptId: trashPrompt!.id, option: 0 });
    expect(out.removed).toContain(trash);
    const gainPrompt = out.prompts.find(p => p.payload?.kind === 'passageGainChoice');
    expect(gainPrompt).toBeDefined();
    // Choose the first offered action (up to cost 30 + 20).
    const pick = gainPrompt!.options[0]!;
    out = applyAction(out, { type: 'chooseOption', seat: 0, promptId: gainPrompt!.id, option: 0 });
    const seat = out.seats[0] as PlayerState;
    expect(seat.setAsideActionInstanceId).toBe(pick);
    // ...and it waits for the seat's OWN next turn (the active seat advanced).
    const ended = applyAction(out, { type: 'endTurn', seat: 0 });
    expect((ended.seats[0] as PlayerState).setAsideActionInstanceId).toBe(pick);
    // Seat 1 takes its turn, then seat 0 starts again and the card is played.
    let mid = startTurn(ended);
    expect(mid.activeSeat).toBe(1);
    mid = startTurn(applyAction(mid, { type: 'endTurn', seat: 1 }));
    expect(mid.activeSeat).toBe(0);
    const nextSeat = mid.seats[0] as PlayerState;
    expect(nextSeat.setAsideActionInstanceId).toBeUndefined();
    expect(nextSeat.playArea).toContain(pick);
  });
});
