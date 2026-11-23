import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { MERCENARIES_CARDS } from '../data/mercenaries';
import { MERCENARIES_PILES, MERCENARIES_MANSION } from '../data/cards';

/**
 * CH-045 HUNK (Mercenaries) L1: "When Hunk would take any Damage, you can lower
 * that Damage by 20. In that case, Gain 1 'Ammo x10'."
 *
 * The reduction used to be folded into `exploreParams.damageReduction` (always
 * on). It is a CHOICE, so the explore now HOLDS the leading character at its
 * pre-damage Health — exactly like B4MC-CH-005 Jill's trash-to-negate hold —
 * and the resolver applies either the reduced or the full loss. That keeps the
 * lethal-hit semantics honest: a Decline can still down him.
 */

let counter = 0;
const nextId = (cardId: string) => `${cardId}#hu${++counter}`;

function mercGame(over: Partial<PlayerState> = {}, mainId = 'ch-045', foeId = 'ch-046'): GameState {
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

function addCard(s: GameState, seat: number, cardId: string, zone: 'hand' | 'discard' | 'inventory' | 'playArea' = 'hand'): { state: GameState; id: string } {
  const id = nextId(cardId);
  return {
    state: {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } },
      seats: s.seats.map((p, i) => {
        if (i !== seat) return p;
        if (zone === 'hand') return { ...p, hand: [...p.hand, id] };
        if (zone === 'discard') return { ...p, discard: [...p.discard, id] };
        if (zone === 'playArea') return { ...p, playArea: [...p.playArea, id] };
        return { ...p, inventory: [...p.inventory, id] };
      }),
    },
    id,
  };
}

/** ma-078 Red Executioner: HP 80, attack 60 — survives a Reliable Blade hit. */
function rigExplore(over: Partial<PlayerState> = {}) {
  let s: GameState = mercGame({ level: 1, hp: 80, actionsLeft: 3, exploresLeft: 2, ...over });
  const w = addCard(s, 0, 'we-050'); // Reliable Blade, 5 damage
  s = w.state;
  const id = nextId('ma-078');
  s = {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId: 'ma-078', location: { zone: 'mansionDeck', index: 0 } } },
    mansionDeck: [id, ...s.mansionDeck],
  };
  const explored = applyAction({ ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 200 } : p)) }, {
    type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1,
  });
  return { explored, weaponId: w.id, revealedId: id };
}

const hunkPrompt = (s: GameState) => s.prompts.find(p => p.payload?.kind === 'hunkDamageReduction');
/** Instance ids that landed in seat 0's discard between two states. */
const gainedToDiscard = (from: GameState, to: GameState): string[] => {
  const before = new Set(from.seats[0]?.discard ?? []);
  return (to.seats[0]?.discard ?? []).filter(id => !before.has(id));
};

describe('CH-045 Hunk L1 — explore damage reduction is a choice', () => {
  it('holds the damage and offers the -20 instead of applying it silently', () => {
    const { explored } = rigExplore();
    expect(explored.seats[0]?.hp).toBe(80); // held at pre-damage Health
    const pr = hunkPrompt(explored);
    expect(pr).toBeDefined();
    expect(pr?.payload?.loss).toBe('60');
    expect(pr?.payload?.amount).toBe('20');
  });

  it('accepting applies only the reduced loss and pays 1 Ammo x10', () => {
    const { explored } = rigExplore();
    const pr = hunkPrompt(explored)!;
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(40); // 80 - (60 - 20)
    const gained = gainedToDiscard(explored, out);
    expect(gained).toHaveLength(1);
    expect(out.cardDefs[out.cards[gained[0]!]?.cardId ?? '']?.type).toBe('ammunition');
    expect(hunkPrompt(out)).toBeUndefined();
  });

  it('declining applies the full loss and pays nothing', () => {
    const { explored } = rigExplore();
    const pr = hunkPrompt(explored)!;
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 1 });
    expect(out.seats[0]?.hp).toBe(20); // 80 - 60
    expect(gainedToDiscard(explored, out)).toHaveLength(0);
  });

  it('a declined lethal hit still downs him (the hold did not hide it)', () => {
    const { explored } = rigExplore({ hp: 60 });
    const pr = hunkPrompt(explored)!;
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 1 });
    expect(out.seats[0]?.hp).toBe(0);
    expect(out.seats[0]?.downed).toBe(true);
  });

  it('accepting a lethal hit leaves him alive at the reduced total', () => {
    const { explored } = rigExplore({ hp: 60 });
    const pr = hunkPrompt(explored)!;
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(20); // 60 - 40
    expect(out.seats[0]?.downed).toBeFalsy();
  });

  it('also holds in a multi-explore (survivors deal their combined attack)', () => {
    let s: GameState = mercGame({ level: 1, hp: 80, exploresLeft: 2 });
    const w = addCard(s, 0, 'we-050');
    s = w.state;
    const a = nextId('ma-079'); // attack 20 each
    const b = nextId('ma-079');
    s = {
      ...s,
      cards: {
        ...s.cards,
        [a]: { instanceId: a, cardId: 'ma-079', location: { zone: 'mansionDeck', index: 0 } },
        [b]: { instanceId: b, cardId: 'ma-079', location: { zone: 'mansionDeck', index: 0 } },
      },
      mansionDeck: [a, b, ...s.mansionDeck],
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 200 } : p)),
    };
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 2 });
    const pr = hunkPrompt(explored);
    expect(pr).toBeDefined();
    expect(pr?.payload?.loss).toBe('40'); // 2 x 20 combined
    const out = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: pr!.id, option: 0 });
    expect(out.seats[0]?.hp).toBe(60);   // 80 - (40 - 20)
  });

  it('is not offered when Hunk is not the one taking the damage', () => {
    let s: GameState = mercGame({ level: 1, hp: 80, exploresLeft: 2 }, 'ch-046', 'ch-044');
    const w = addCard(s, 0, 'we-050');
    s = w.state;
    const id = nextId('ma-079'); // Big Man Majini, attack 20
    s = {
      ...s,
      cards: { ...s.cards, [id]: { instanceId: id, cardId: 'ma-079', location: { zone: 'mansionDeck', index: 0 } } },
      mansionDeck: [id, ...s.mansionDeck],
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 200 } : p)),
    };
    const explored = applyAction(s, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    expect(explored.seats[0]?.hp).toBe(60); // full 20, no hold
    expect(hunkPrompt(explored)).toBeUndefined();
  });
});
