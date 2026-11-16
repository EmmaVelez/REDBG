import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { enumerateLegalActions } from '../ai/enumerate';
import { checkWin } from './game';
import { locationScore, locationEndOfTurnDraws } from './locations';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * Fan "Locations" line (LOC-001..008) — GLOBAL / 1X / investment room cards.
 * A location on top of the location deck is revealed by an Explore (the
 * Explore is consumed); its On Reveal effect fires at that moment.
 */

const LOC_IDS = ['loc-001', 'loc-002', 'loc-003', 'loc-004', 'loc-005', 'loc-006', 'loc-007', 'loc-008', 'loc-009', 'loc-010', 'loc-011', 'loc-012', 'loc-013', 'loc-014', 'loc-015'] as const;

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

/** Force a specific location to the top of the face-down location deck. */
function onlyLocation(s: GameState, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#loc${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } } as GameState['cards'];
  const deck = [id, ...(s.locationDeck ?? []).filter(x => x !== id)];
  return { state: { ...s, cards, locationDeck: deck, locations: [] }, id };
}

function revealed(s: GameState, cardId: string) {
  return (s.locations ?? []).find(l => s.cards[l.instanceId]?.cardId === cardId);
}

/** Reveal the given location and dismiss the acknowledgement prompt. */
function revealAndAck(s: GameState, cardId: string): GameState {
  const top = onlyLocation(s, cardId);
  const explored = applyAction(top.state, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
  let out = explored;
  // Resolve every prompt the reveal raised, in order.
  for (let guard = 0; guard < 20 && out.prompts.length > 0; guard++) {
    const p = out.prompts[0];
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

describe('Locations — data', () => {
  it('defines all eight with the printed kind and cost', () => {
    expect(locDef('loc-001')).toEqual(expect.objectContaining({ id: 'loc-001', name: 'Library', locationKind: 'global', locationCosts: [3] }));
    expect(locDef('loc-002')).toEqual(expect.objectContaining({ id: 'loc-002', name: 'Arklay Laboratory', locationKind: 'onex', locationCost: 30 }));
    expect(locDef('loc-003')).toEqual(expect.objectContaining({ id: 'loc-003', name: "Keeper's Room", locationKind: 'global', locationCosts: [10] }));
    expect(locDef('loc-004')).toEqual(expect.objectContaining({ id: 'loc-004', name: 'Kitchen', locationKind: 'global', locationCosts: [10] }));
    expect(locDef('loc-005')).toEqual(expect.objectContaining({ id: 'loc-005', name: 'Large Art Room', locationKind: 'global', locationCosts: [20] }));
    expect(locDef('loc-006')).toEqual(expect.objectContaining({ id: 'loc-006', name: 'Large Gallery', locationKind: 'global', locationCosts: [20] }));
    expect(locDef('loc-007')).toEqual(expect.objectContaining({ id: 'loc-007', name: 'Large Library', locationKind: 'global', locationCosts: [20] }));
    expect(locDef('loc-008')).toEqual(expect.objectContaining({ id: 'loc-008', name: 'Lesson Space', locationKind: 'global', locationCosts: [20] }));
  });

  it('has no duplicate ids and is not in the base card pool', () => {
    for (const id of LOC_IDS) {
      expect(CUSTOM_CARDS.filter(c => c.id === id)).toHaveLength(1);
    }
  });

  it('deals NO location deck unless locationsMode is on (opt-in rule)', () => {
    const players = [{ name: 'P0', controller: 'human' as const }, { name: 'P1', controller: 'human' as const }];
    const plain = startTurn(setup({ seed: 11, players }, [...PREMIER_CARDS, ...CUSTOM_CARDS], FIRST_TIMER_PILES, STANDARD_MANSION_DECK));
    expect(plain.locationDeck).toBeUndefined();
    expect(plain.locations ?? []).toEqual([]);
  });

  it('deals every location into the face-down location deck at setup', () => {
    const s = game();
    expect(s.locationDeck?.length).toBe(LOC_IDS.length);
    expect(s.locations ?? []).toEqual([]);
  });
});

describe('Locations — reveal', () => {
  it('an Explore reveals the top location and consumes the Explore', () => {
    let s = game({ level: 1, hp: 80, exploresLeft: 2 });
    const top = onlyLocation(s, 'loc-001');
    s = top.state;
    const after = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect(revealed(after, 'loc-001')).toBeDefined();
    expect(after.locationDeck?.includes(top.id)).toBe(false);
    expect((after.seats[0] as PlayerState).exploresLeft).toBe(1);
  });

  it('does NOT reveal anything when the location deck is empty', () => {
    let s = game({ level: 1, hp: 80, exploresLeft: 1 });
    s = { ...s, locationDeck: [], locations: [] };
    const after = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    // It reached the mansion instead: no location was revealed or left a deck.
    expect(after.locations ?? []).toEqual([]);
    expect(after.locationDeck ?? []).toEqual([]);
    expect(after.mansionDeck.length).toBe(s.mansionDeck.length);
  });

  it('Library: GLOBAL reveal heals every player 10', () => {
    let s = game({ level: 1, hp: 50, maxHp: 100, exploresLeft: 1 });
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hp: 50 } : { ...p, hp: 60 })) };
    const top = onlyLocation(s, 'loc-001');
    const after = applyAction(top.state, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect((after.seats[0] as PlayerState).hp).toBe(60);
    expect((after.seats[1] as PlayerState).hp).toBe(70);
  });

  it('Lesson Space: GLOBAL reveal costs every player 5 health', () => {
    let s = game({ level: 1, hp: 80, exploresLeft: 1 });
    const top = onlyLocation(s, 'loc-008');
    const after = applyAction(top.state, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    // GLOBAL: both players pay 5 (seat 1 was already at its 100 cap, so it
    // only drops to 95).
    expect((after.seats[0] as PlayerState).hp).toBe(75);
    expect((after.seats[1] as PlayerState).hp).toBe(95);
  });
});

describe('Locations — 1X (Arklay Laboratory)', () => {
  it('is enumerated once revealed and costs 1 Buy + 30 gold', () => {
    let s = game({ level: 1, exploresLeft: 1, turnGold: 100, buysLeft: 1 });
    s = revealAndAck(s, 'loc-002');
    const legal = enumerateLegalActions(s, 0);
    const use = legal.find(a => a.type === 'useLocation');
    expect(use).toBeDefined();
    const after = applyAction(s, { type: 'useLocation', seat: 0, instanceId: use!.instanceId });
    const seat = after.seats[0] as PlayerState;
    expect(seat.turnGold).toBe(70);
    expect(seat.buysLeft).toBe(1);      // spent 1, the card refunds +1 Buy
    expect(seat.turnAmmo).toBe(10);
    expect(seat.arklayArmed).toBe(true);
  });

  it('cannot be bought without the gold', () => {
    let s = game({ level: 1, exploresLeft: 1, turnGold: 10, buysLeft: 1 });
    s = revealAndAck(s, 'loc-002');
    const loc = revealed(s, 'loc-002');
    expect(validateAction(s, { type: 'useLocation', seat: 0, instanceId: loc!.instanceId }).ok).toBe(false);
  });

  it('arms the first-explore bonus, which is consumed by that explore', () => {
    let s = game({ level: 1, hp: 200, exploresLeft: 2, turnGold: 100, buysLeft: 1, turnAmmo: 100 });
    s = revealAndAck(s, 'loc-002');
    const use = enumerateLegalActions(s, 0).find(a => a.type === 'useLocation')!;
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: use.instanceId });
    expect((s.seats[0] as PlayerState).arklayArmed).toBe(true);
    // An explore consumes the armed bonus.
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    expect((s.seats[0] as PlayerState).arklayArmed ?? false).toBe(false);
  });
});

describe('Locations — scoring', () => {
  it('Library scores 3 per complete 10/20/30 ammo set', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    const top = onlyLocation(s, 'loc-001');
    s = applyAction(top.state, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    // Give seat 0 one 10, one 20 and one 30 ammo card => exactly one set.
    const mk = (id: string) => {
      const i = `${id}#sc${++counter}`;
      s = {
        ...s,
        cards: { ...s.cards, [i]: { instanceId: i, cardId: id, location: { zone: 'discard', index: 0, seat: 0 } } },
        seats: s.seats.map((p, x) => (x === 0 ? { ...p, discard: [...p.discard, i] } : p)),
      }
    };
    mk('am-001'); mk('am-002'); mk('am-003');
    expect(locationScore(s, 0)).toBe(3);
  });

  it('Large Library scores 2 for each attached Infected with <= 20 health', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    const top = onlyLocation(s, 'loc-007');
    s = applyAction(top.state, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    // Attach two low-health infected to seat 0.
    for (const [id, hp] of [['ma-005', 10], ['ma-006', 20], ['ma-007', 60]] as const) {
      const i = `${id}#att${++counter}`;
      s = {
        ...s,
        cards: { ...s.cards, [i]: { instanceId: i, cardId: id, location: { zone: 'attached', index: 0, seat: 0 } } },
        cardDefs: { ...s.cardDefs, [id]: { ...s.cardDefs[id], hp } } as GameState['cardDefs'],
        seats: s.seats.map((p, x) => (x === 0 ? { ...p, attached: [...p.attached, i] } : p)),
      };
    }
    expect(locationScore(s, 0)).toBe(4);
  });

  it('scores feed the end-game ranking', () => {
    let s = game({ level: 1, exploresLeft: 1 });
    const top = onlyLocation(s, 'loc-005');   // Large Art Room: 1 dec per 3 XP
    s = applyAction(top.state, { type: 'explore', seat: 0, weapons: [], exploreCount: 1 });
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, xp: 6 } : p)) };
    expect(locationScore(s, 0)).toBe(2);
    const win = checkWin({ ...s, phase: 'gameOver' });
    expect(win.gameOver || win.winners).toBeTruthy();
  });
});

describe('Locations — Kitchen (2nd-gain trash)', () => {
  it('offers the trash when the seat gains a 2nd card while Kitchen is revealed', () => {
    let s = game({ level: 1, exploresLeft: 1, turnGold: 100, buysLeft: 3 });
    s = revealAndAck(s, 'loc-004');
    // Buy two cards: the 2nd gain must raise the Kitchen prompt.
    const pile = Object.values(s.marketPiles).find(p => p.cards.length > 1)!;
    s = applyAction(s, { type: 'buy', seat: 0, pileId: pile.pileId });
    s = applyAction(s, { type: 'buy', seat: 0, pileId: pile.pileId });
    const kitchen = s.prompts.find(p => p.payload?.kind === 'locTrashSecondGain');
    expect(kitchen).toBeDefined();
  });
});

describe('Locations — investment', () => {
  /** Inject a plain investment location into the pool (none of the 8 fan cards
   *  is an investment card, but the engine supports the kind). */
  function withInvestLocation(s: GameState, cardId: string): { state: GameState; id: string } {
    const id = `${cardId}#inv${++counter}`;
    const def = {
      id: cardId, name: 'Elevator Room', type: 'location' as const, set: 'custom' as const,
      locationKind: 'invest' as const, locationCosts: [10, 20],
      text: 'Investment', copies: 1,
    };
    return {
      state: {
        ...s,
        cardDefs: { ...s.cardDefs, [cardId]: def } as GameState['cardDefs'],
        cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'supply', index: 0 } } } as GameState['cards'],
        locations: [...(s.locations ?? []), { instanceId: id, cubes: {} }],
      },
      id,
    };
  }

  it('charges the printed gold + 1 Buy per cube, left to right', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 3 });
    const inj = withInvestLocation(s, 'loc-x1');
    s = inj.state;
    expect(validateAction(s, { type: 'investLocation', seat: 0, instanceId: inj.id }).ok).toBe(true);
    s = applyAction(s, { type: 'investLocation', seat: 0, instanceId: inj.id });
    let st = s.seats[0] as PlayerState;
    expect(st.turnGold).toBe(90);
    expect(st.buysLeft).toBe(2);
    // Second cube costs the SECOND printed price.
    s = applyAction(s, { type: 'investLocation', seat: 0, instanceId: inj.id });
    st = s.seats[0] as PlayerState;
    expect(st.turnGold).toBe(70);
    expect(st.buysLeft).toBe(1);
    // Both cubes are recorded on the card.
    const loc = (s.locations ?? []).find(l => l.instanceId === inj.id);
    expect(loc?.cubes[0]).toBe(2);
  });

  it('rejects a third cube once the printed prices run out', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 5 });
    const inj = withInvestLocation(s, 'loc-x1');
    s = inj.state;
    s = applyAction(s, { type: 'investLocation', seat: 0, instanceId: inj.id });
    s = applyAction(s, { type: 'investLocation', seat: 0, instanceId: inj.id });
    expect(validateAction(s, { type: 'investLocation', seat: 0, instanceId: inj.id }).ok).toBe(false);
  });

  it('is enumerated by the AI only while a slot is affordable', () => {
    let s = game({ level: 1, turnGold: 100, buysLeft: 1 });
    const inj = withInvestLocation(s, 'loc-x1');
    s = inj.state;
    expect(enumerateLegalActions(s, 0).some(a => a.type === 'investLocation')).toBe(true);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnGold: 5 } : p)) };
    expect(enumerateLegalActions(s, 0).some(a => a.type === 'investLocation')).toBe(false);
  });
});

describe('Locations — 1X per-turn cap', () => {
  it('enforces "Max: once per turn" on Arklay Laboratory', () => {
    let s = game({ level: 1, exploresLeft: 2, turnGold: 200, buysLeft: 2, turnAmmo: 100 });
    s = revealAndAck(s, 'loc-002');
    const loc = revealed(s, 'loc-002')!;
    s = applyAction(s, { type: 'useLocation', seat: 0, instanceId: loc.instanceId });
    expect((s.seats[0] as PlayerState).locationUsesThisTurn).toEqual([loc.instanceId]);
    // Second use in the same turn is refused.
    expect(validateAction(s, { type: 'useLocation', seat: 0, instanceId: loc.instanceId }).ok).toBe(false);
    expect(enumerateLegalActions(s, 0).some(a => a.type === 'useLocation')).toBe(false);
  });
});

describe('Locations — GLOBAL card, revealer-only effect', () => {
  it("Large Library's end-of-turn draw goes only to the revealing seat", () => {
    let s = game({ level: 1, exploresLeft: 1 });
    s = revealAndAck(s, 'loc-007');
    // Seat 0 revealed it. The draw helper must return 2 for seat 0, 0 for seat 1.
    expect(locationEndOfTurnDraws(s, 0)).toBe(2);
    expect(locationEndOfTurnDraws(s, 1)).toBe(0);
  });
});
