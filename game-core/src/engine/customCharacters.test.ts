import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * Custom character line — CU-001 Ricardo Irving.
 * L1: reveal the top of your Inventory; an Action there moves to your hand.
 * L2: a hit above 30 is lowered by 10 and the player picks who takes 10.
 */

const RIC = CUSTOM_CARDS.find(c => c.id === 'cu-001');

function ricGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'Ricardo', controller: 'human', characterCardId: 'cu-001' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-002' },
      ],
    },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;
function addToZone(s: GameState, seat: number, cardId: string, zone: 'hand' | 'inventory' | 'discard' | 'playArea'): GameState {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0, seat } } };
  const seats = s.seats.map((p, i) => {
    if (i !== seat) return p;
    if (zone === 'hand') return { ...p, hand: [...p.hand, id] };
    if (zone === 'inventory') return { ...p, inventory: [id, ...p.inventory] };
    if (zone === 'discard') return { ...p, discard: [...p.discard, id] };
    return { ...p, playArea: [...p.playArea, id] };
  });
  return { ...s, cards, seats };
}

function mansionTop(s: GameState, cardId: string): GameState {
  const id = `${cardId}#t${++counter}`;
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } },
    mansionDeck: [id, ...s.mansionDeck],
  };
}

function findHand(s: GameState, cardId: string, seat = 0): string {
  const p = s.seats[seat];
  const id = (p?.hand ?? []).find(hid => s.cards[hid]?.cardId === cardId);
  if (id === undefined) throw new Error(`card ${cardId} not in hand of seat ${seat}`);
  return id;
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

describe('CU-001 Ricardo Irving data', () => {
  it('matches the printed card', () => {
    expect(RIC).toEqual(expect.objectContaining({
      id: 'cu-001',
      name: 'Ricardo Irving',
      type: 'character',
      set: 'custom',
      copies: 1,
      maxHp: 80,
      level1At: 3,
      level2At: 8,
    }));
    expect(RIC?.abilities).toEqual([
      { kind: 'revealInventoryTopForAction', level: 1 },
      { kind: 'damageReductionAndGiveDamage', threshold: 30, reduction: 10, give: 10, level: 2 },
    ]);
    expect(RIC?.levels).toHaveLength(2);
  });

  it('joins the deal pool only when the room selected the custom cards', () => {
    expect(cardsForScenario('firstTimer').some(c => c.id === 'cu-001')).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['cu-001'] });
    expect(on.some(c => c.id === 'cu-001')).toBe(true);
  });

  it('setup deals him as a character with 80 Health', () => {
    const s = ricGame();
    expect(s.seats[0]?.characterInstanceId).toBeDefined();
    expect(s.seats[0]?.maxHp).toBe(80);
    expect(s.seats[0]?.hp).toBe(80);
  });
});

describe('CU-001 L1 — reveal the Inventory top', () => {
  it('moves an Action from the Inventory top to hand', () => {
    const s = ricGame({ level: 1, decorations: 5 });
    const withAction = addToZone(s, 0, 'ac-002', 'inventory');
    const topId = withAction.seats[0]?.inventory[0];
    expect(topId).toBeDefined();

    const next = applyAction(withAction, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });

    expect(next.seats[0]?.hand).toContain(topId!);
    expect(next.seats[0]?.inventory).not.toContain(topId!);
    const prompt = findPrompt(next, 'revealInventoryTop');
    expect(prompt).toBeDefined();
    expect(prompt?.options).toEqual(['OK']);
  });

  it('leaves a non-Action on top of the Inventory', () => {
    const s = ricGame({ level: 1, decorations: 5 });
    const withHerb = addToZone(s, 0, 'it-001', 'inventory');
    const topId = withHerb.seats[0]?.inventory[0];

    const next = applyAction(withHerb, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });

    expect(next.seats[0]?.inventory).toContain(topId!);
    expect(next.seats[0]?.hand).not.toContain(topId!);
  });

  it('is once per turn and needs a non-empty Inventory', () => {
    const s = ricGame({ level: 1, decorations: 5 });
    const first = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(validateAction(first, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);

    const empty = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, inventory: [] } : p)) };
    expect(validateAction(empty, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
  });
});

describe('CU-001 L2 — lower a big hit, give 10 to any Character', () => {
  it('lowers a 70-damage hit to 60 and asks for a target', () => {
    const s = ricGame({ level: 2, decorations: 10, hp: 80 });
    const withBoss = mansionTop(s, 'ma-010'); // Uroboros Aheri: 70 attack
    const armed = addToZone(withBoss, 0, 'we-004', 'hand'); // Combat Knife: 5 damage
    const weapon = findHand(armed, 'we-004');

    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });

    // 70 hit lowered by 10 -> 60 taken.
    expect(next.seats[0]?.hp).toBe(20);
    const prompt = findPrompt(next, 'ricardoL2');
    expect(prompt).toBeDefined();
    expect(prompt?.options).toContain('Decline');
    expect(prompt?.options).toContain('1');
  });

  it('accepting deals 10 to the chosen Character', () => {
    const s = ricGame({ level: 2, decorations: 10, hp: 80 });
    const withBoss = mansionTop(s, 'ma-010');
    const armed = addToZone(withBoss, 0, 'we-004', 'hand');
    const weapon = findHand(armed, 'we-004');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    const prompt = findPrompt(next, 'ricardoL2');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;

    const optionIndex = prompt.options.indexOf('1');
    expect(optionIndex).toBeGreaterThanOrEqual(0);
    const after = applyAction(next, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: optionIndex });

    expect(after.seats[0]?.hp).toBe(20);          // unchanged: the reduction stands
    expect(after.seats[1]?.hp).toBe(70);          // 80 - 10
    expect(after.prompts).toHaveLength(0);
  });

  it('declining re-applies the reduction (the full hit lands)', () => {
    const s = ricGame({ level: 2, decorations: 10, hp: 80 });
    const withBoss = mansionTop(s, 'ma-010');
    const armed = addToZone(withBoss, 0, 'we-004', 'hand');
    const weapon = findHand(armed, 'we-004');
    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    const prompt = findPrompt(next, 'ricardoL2');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;

    const optionIndex = prompt.options.indexOf('Decline');
    const after = applyAction(next, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: optionIndex });

    expect(after.seats[0]?.hp).toBe(10);          // 80 - 70
    expect(after.seats[1]?.hp).toBe(80);          // untouched
  });

  it('does not fire for a hit of 30 or less', () => {
    const s = ricGame({ level: 2, decorations: 10, hp: 80 });
    // MA-006 Bui Kichwa: 30 attack.
    const withInfected = mansionTop(s, 'ma-006');
    const armed = addToZone(withInfected, 0, 'we-004', 'hand');
    const weapon = findHand(armed, 'we-004');

    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });

    expect(next.seats[0]?.hp).toBe(50);           // full 30, no reduction
    expect(findPrompt(next, 'ricardoL2')).toBeUndefined();
  });

  it('is level-gated: Level 1 has no L2', () => {
    const s = ricGame({ level: 1, decorations: 5, hp: 80 });
    const withBoss = mansionTop(s, 'ma-010');
    const armed = addToZone(withBoss, 0, 'we-004', 'hand');
    const weapon = findHand(armed, 'we-004');

    const next = applyAction(armed, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });

    expect(next.seats[0]?.hp).toBe(10);           // full 70
    expect(findPrompt(next, 'ricardoL2')).toBeUndefined();
  });
});
