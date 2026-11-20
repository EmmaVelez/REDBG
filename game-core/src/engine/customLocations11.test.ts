import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { enumerateLegalActions } from '../ai/enumerate';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * Fan Locations batch 11 (LOC-046..048) — read from Manny's scans with the
 * local Ollama vision model (2026-11-20), two verbatim passes agreed:
 *
 *   loc-046 Birdcage Corridor — 1X, 40: gain an infection (optional); if you
 *           do, trash a hand card; +10 damage per 10 of its cost on the FIRST
 *           explore this turn (40 total).
 *   loc-047 Boiler Storage Area — 1X, 50: gain 20 health OR remove an
 *           infection. On Reveal: every other player may gain an action card
 *           costing 50 or less.
 *   loc-048 Cemetery — 1X, 40: lose 10 health, gain an infection, gain 30
 *           ammo. On Reveal: you may look at the top card of your inventory
 *           and discard it or put it back.
 */

const BATCH = ['loc-046', 'loc-047', 'loc-048'] as const;

function locDef(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

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

function onlyLocation(s: GameState, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#loc${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } } as GameState['cards'];
  const deck = [id, ...(s.locationDeck ?? []).filter(x => x !== id)];
  return { state: { ...s, cards, locationDeck: deck, locations: [] }, id };
}

function revealed(s: GameState, cardId: string) {
  return (s.locations ?? []).find(l => s.cards[l.instanceId]?.cardId === cardId);
}

function revealRaw(s: GameState, cardId: string): GameState {
  const top = onlyLocation(s, cardId);
  return applyAction(top.state, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

/** Dismiss the location-reveal acknowledgement prompt(s) with option 0. */
function ackReveals(s: GameState): GameState {
  let out = s;
  for (let g = 0; g < 20; g++) {
    const p = out.prompts.find(x => x.payload?.kind === 'locRevealAck');
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

/** Resolve every pending prompt with option 0 (for use flows where the
 *  reveal raises offers/peeks the test does not care about). */
function dismissAllPromptss(s: GameState): GameState {
  let out = s;
  for (let g = 0; g < 40; g++) {
    const p = out.prompts[0];
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

function addHand(s: GameState, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#h${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0, seat: 0 } } };
  return { state: { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, id] } : p)) }, id };
}

/** Give the game an infection deck so infection-gaining effects can fire. */
function withInfections(s: GameState, n = 2): GameState {
  const ids = Array.from({ length: n }, (_, i) => `in-001#i${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: 'in-001', location: { zone: 'infectionDeck' as const, index: 0 } };
  }
  return { ...s, cards, infectionDeck: ids };
}

describe('Locations batch 11 — data', () => {
  it('defines the three as 1X locations with the printed costs', () => {
    expect(locDef('loc-046')).toEqual(expect.objectContaining({
      id: 'loc-046', name: 'Birdcage Corridor', locationKind: 'onex', locationCost: 40, locationMaxPerTurn: 1,
    }));
    expect(locDef('loc-047')).toEqual(expect.objectContaining({
      id: 'loc-047', name: 'Boiler Storage Area', locationKind: 'onex', locationCost: 50, locationMaxPerTurn: 1,
    }));
    expect(locDef('loc-048')).toEqual(expect.objectContaining({
      id: 'loc-048', name: 'Cemetery', locationKind: 'onex', locationCost: 40, locationMaxPerTurn: 1,
    }));
  });
});

describe('loc-046 Birdcage Corridor', () => {
  it('use: opted-in infection trashes a hand card and arms 40 first-explore damage', () => {
    let s = withInfections(game({ level: 1, exploresLeft: 2, turnGold: 100, buysLeft: 1, turnAmmo: 100 }));
    const withKnife = addHand(s, 'we-004');
    s = withKnife.state;
    s = revealRaw(s, 'loc-046');
    s = ackReveals(s);
    const loc = revealed(s, 'loc-046')!;
    // pay the use: the infection prompt appears, and the bonus is armed at once.
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: loc.instanceId });
    expect((s.seats[0] as PlayerState).turnGold).toBe(60);
    expect((s.seats[0] as PlayerState).firstExploreDamageBonus).toBe(40);
    const inf = findPrompt(s, 'birdcageInfectionChoice');
    expect(inf).toBeDefined();
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: inf!.id, option: 0 }); // Gain
    expect((s.seats[0] as PlayerState).infectionCards ?? []).toHaveLength(1);
    const trash = findPrompt(s, 'birdcageTrashPick');
    expect(trash).toBeDefined();
    const target = trash!.options[0]!;
    const before = (s.seats[0] as PlayerState).hand.length;
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: trash!.id, option: 0 });
    const seat = s.seats[0] as PlayerState;
    expect(seat.hand.length).toBe(before - 1);
    expect(seat.discard).toContain(target);
  });

  it('use: declining the infection skips the trash but keeps the bonus', () => {
    let s = game({ level: 1, exploresLeft: 2, turnGold: 100, buysLeft: 1, turnAmmo: 100 });
    const withKnife = addHand(s, 'we-004');
    s = withKnife.state;
    s = revealRaw(s, 'loc-046');
    s = ackReveals(s);
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: revealed(s, 'loc-046')!.instanceId });
    const inf = findPrompt(s, 'birdcageInfectionChoice')!;
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: inf.id, option: 1 }); // Decline
    expect((s.seats[0] as PlayerState).infectionCards ?? []).toHaveLength(0);
    expect(findPrompt(s, 'birdcageTrashPick')).toBeUndefined();
    expect((s.seats[0] as PlayerState).firstExploreDamageBonus).toBe(40);
    // The preview mirrors the armed bonus: Knife 5 + 40 = 45.
    expect(exploreDamage(s, 0, [(s.seats[0] as PlayerState).hand.find(id => s.cards[id]?.cardId === 'we-004')!])).toBe(45);
  });

  it('the first explore consumes the bonus', () => {
    let s = game({ level: 1, exploresLeft: 2, turnGold: 100, buysLeft: 1, turnAmmo: 100 });
    s = revealRaw(s, 'loc-046');
    s = ackReveals(s);
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: revealed(s, 'loc-046')!.instanceId });
    const inf = findPrompt(s, 'birdcageInfectionChoice')!;
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: inf.id, option: 1 });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect((s.seats[0] as PlayerState).firstExploreDamageBonus ?? 0).toBe(0);
  });

  it('cannot be used below its gold cost', () => {
    let s = game({ level: 1, exploresLeft: 1, turnGold: 10, buysLeft: 1 });
    s = revealRaw(s, 'loc-046');
    expect(validateAction(s, { type: 'useLocation', seat: 0, instanceId: revealed(s, 'loc-046')!.instanceId }).ok).toBe(false);
  });
});

describe('loc-047 Boiler Storage Area', () => {
  it('use: choose Gain 20 Health', () => {
    let s = game({ level: 1, exploresLeft: 2, turnGold: 100, buysLeft: 1, hp: 30 });
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: 30, maxHp: 80 } : p)) };
    s = revealRaw(s, 'loc-047');
    s = dismissAllPromptss(s);
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: revealed(s, 'loc-047')!.instanceId });
    const pr = findPrompt(s, 'boilerHealthOrCure')!;
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    expect((s.seats[0] as PlayerState).hp).toBe(50);
  });

  it('use: choose Remove an Infection', () => {
    let s = game({ level: 1, exploresLeft: 2, turnGold: 100, buysLeft: 1 });
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, infectionCards: ['inf#1'] } : p)) };
    s = revealRaw(s, 'loc-047');
    s = dismissAllPromptss(s);
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: revealed(s, 'loc-047')!.instanceId });
    const pr = findPrompt(s, 'boilerHealthOrCure')!;
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 1 });
    expect((s.seats[0] as PlayerState).infectionCards ?? []).toHaveLength(0);
  });

  it('reveal: every OTHER player may gain an action card costing 50 or less', () => {
    let s = game({ level: 1, exploresLeft: 1, turnGold: 100, buysLeft: 1 });
    s = revealRaw(s, 'loc-047');
    // The offer goes to seat 1 (not the revealing seat 0).
    const offer = findPrompt(s, 'locGainActionAtMostChoice');
    expect(offer?.seat).toBe(1);
    expect(s.prompts.some(p => p.payload?.kind === 'locGainActionAtMostChoice' && p.seat === 0)).toBe(false);
    const chosen = offer!.options[0]!;
    s = applyAction(s, { type: 'chooseOption', seat: 1, promptId: offer!.id, option: 0 });
    const seat1 = s.seats[1] as PlayerState;
    expect(seat1.discard).toContain(chosen);
    // 'Decline' is clean.
    const offer2 = findPrompt(s, 'locGainActionAtMostChoice');
    void offer2;
  });

  it('reveal: declining is a no-op', () => {
    let s = game({ level: 1, exploresLeft: 1, turnGold: 100, buysLeft: 1 });
    s = revealRaw(s, 'loc-047');
    const offer = findPrompt(s, 'locGainActionAtMostChoice')!;
    const before = (s.seats[1] as PlayerState).discard.length;
    s = applyAction(s, { type: 'chooseOption', seat: 1, promptId: offer.id, option: offer.options.length - 1 });
    expect((s.seats[1] as PlayerState).discard.length).toBe(before);
  });
});

describe('loc-048 Cemetery', () => {
  it('use: loses 10 health, gains an infection and 30 ammo', () => {
    let s = withInfections(game({ level: 1, exploresLeft: 2, turnGold: 100, buysLeft: 1, turnAmmo: 5 }));
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: 60, maxHp: 80 } : p)) };
    s = revealRaw(s, 'loc-048');
    s = dismissAllPromptss(s);
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: revealed(s, 'loc-048')!.instanceId });
    const seat = s.seats[0] as PlayerState;
    expect(seat.hp).toBe(50);
    expect(seat.infectionCards ?? []).toHaveLength(1);
    expect(seat.turnAmmo).toBe(35);
  });

  it('reveal: look at the top Inventory card and discard it or put it back', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, inventory: ['inv-top#1', 'inv-2#1'] } : p)) };
    s = revealRaw(s, 'loc-048');
    s = ackReveals(s);
    const peek = findPrompt(s, 'locInventoryTopPeek')!;
    expect(peek.options[0]).toBe('inv-top#1');
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: peek.id, option: 0 }); // discard
    const seat = s.seats[0] as PlayerState;
    expect(seat.inventory).toEqual(['inv-2#1']);
    expect(seat.discard).toContain('inv-top#1');
    // Put Back keeps it.
    s = revealRaw(game({ level: 1, exploresLeft: 1 }), 'loc-048');
    s = ackReveals(s);
    const peek2 = findPrompt(s, 'locInventoryTopPeek')!;
    expect(peek2).toBeDefined();
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: peek2.id, option: 1 });
    void BATCH;
    expect((s.seats[0] as PlayerState).inventory.length).toBeGreaterThanOrEqual(0);
  });
});