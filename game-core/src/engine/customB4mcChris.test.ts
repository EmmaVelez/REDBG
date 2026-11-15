import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { ALL_CARDS, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { chrisL1TurnDamageBonus, chrisL2TopOfMansion } from './abilities';

/**
 * B4MC Chris Redfield fan prints (JP 2025, "not for sale").
 *  CH-007  90 Health, gates 3 / 6
 *    L1: Once per round, when an Infected would deal any Damage, you can lower
 *        that Damage's number by 10. In that case, Gain 1 "Ammo x10".
 *    L2: Once during your turn, when you Trash a card, get +1 card.
 *  CH-008  90 Health, gates 2 / 7
 *    L1: If an Infected dealt Damage this round, Chris does +10 Damage this
 *        turn. If a Character is face down, Chris does +20 Damage instead.
 *    L2: Once per round, when an Infected is not Defeated, you can put it on
 *        top of the Mansion (even if it's the BOSS).
 *  CH-009  90 Health, single level, gate 3
 *    L1: At the start of your turn, you can get +1 Explore and Chris does +10
 *        Damage this turn. In that case, you must Explore at least twice this
 *        turn.
 */

const CH007 = 'b4mc-ch-007';
const CH008 = 'b4mc-ch-008';
const CH009 = 'b4mc-ch-009';

function def(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id} in CUSTOM_CARDS`);
  return d;
}

function game(id: string, over: Partial<PlayerState> = {}, seatCount = 1, chrisSeat = 0): GameState {
  const players = Array.from({ length: seatCount }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === chrisSeat ? id : 'ch-003',
  }));
  const s = setup(
    { seed: 11, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === chrisSeat ? { ...p, ...over } : p)) };
}

/** Fresh turn for `seat`, with `over` applied before and after startTurn. */
function turn(id: string, over: Partial<PlayerState> = {}, seat = 0, seatCount = 1, chrisSeat = 0): GameState {
  const turned = startTurn(game(id, over, seatCount, chrisSeat));
  return { ...turned, seats: turned.seats.map((p, i) => (i === seat ? { ...p, ...over } : p)) };
}

let counter = 0;

function addCard(s: GameState, seat: number, cardId: string): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'hand' as const, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat ? { ...p, hand: [...p.hand, id] } : p));
  return { state: { ...s, cards, seats }, id };
}

function setMansionTop(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    cards[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck' as const, index: 0 } };
    ids.push(id);
  }
  return { state: { ...s, cards, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

/** Answer (or decline) every pending turn-start ability prompt. */
function clearTurnStartPrompts(s: GameState): GameState {
  let out = s;
  for (const kind of ['chris009ExploreDamage', 'turnStartPlusExploreRequiresTwoExplores']) {
    for (let guard = 0; guard < 8; guard += 1) {
      const p = findPrompt(out, kind);
      if (p === undefined) break;
      out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

describe('B4MC Chris data', () => {
  it('CH-007 matches the printed card (90 Health, gates 3 / 6)', () => {
    expect(def(CH007)).toEqual(expect.objectContaining({
      id: CH007, name: 'Chris Redfield', type: 'character', set: 'custom', copies: 1,
      maxHp: 90, level1At: 3, level2At: 6,
    }));
    expect(def(CH007).abilities).toEqual([
      { kind: 'infectedDamageReductionOncePerRoundGainAmmo', amount: 10, level: 1 },
      { kind: 'drawCardOnTrashOncePerTurn', level: 2 },
    ]);
  });

  it('CH-008 matches the printed card (90 Health, gates 2 / 7)', () => {
    expect(def(CH008)).toEqual(expect.objectContaining({
      id: CH008, name: 'Chris Redfield', type: 'character', set: 'custom', copies: 1,
      maxHp: 90, level1At: 2, level2At: 7,
    }));
    expect(def(CH008).abilities).toEqual([
      { kind: 'turnDamageIfInfectedDealtDamageThisRound', amount: 10, downedAmount: 20, level: 1 },
      { kind: 'notDefeatedInfectedToMansionTopOncePerRound', level: 2 },
    ]);
  });

  it('CH-009 is a single-level character (90 Health, gate 3)', () => {
    expect(def(CH009)).toEqual(expect.objectContaining({
      id: CH009, name: 'Chris Redfield', type: 'character', set: 'custom', copies: 1,
      maxHp: 90, level1At: 3,
    }));
    expect(def(CH009).level2At).toBeUndefined();
    expect(def(CH009).abilities).toEqual([
      { kind: 'turnStartPlusExploreRequiresTwoExploresAndDamage', amount: 10, level: 1 },
    ]);
    expect(def(CH009).levels).toHaveLength(1);
  });

  it('none of them are part of ALL_CARDS — the room toggle is the only way in', () => {
    for (const id of [CH007, CH008, CH009]) {
      expect(ALL_CARDS.some(c => c.id === id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// CH-009 — turn-start +1 Explore / +10 Damage, owing two Explores
// ---------------------------------------------------------------------------

describe('CH-009: turn-start +1 Explore and +10 Damage', () => {
  it('offers the choice at the start of his turn once he is level 1', () => {
    const s = turn(CH009, { level: 1, decorations: 3, hp: 90 });
    const prompt = findPrompt(s, 'chris009ExploreDamage');
    expect(prompt).toBeDefined();
    expect(prompt?.options).toEqual(['Gain +1 Explore', 'Decline']);
    expect(prompt?.seat).toBe(0);
  });

  it('does not offer it below level 1', () => {
    const s = turn(CH009, { level: 0, decorations: 0, hp: 90 });
    expect(findPrompt(s, 'chris009ExploreDamage')).toBeUndefined();
  });

  it('accepting grants +1 Explore, +10 Damage this turn and a debt of two Explores', () => {
    const s = turn(CH009, { level: 1, decorations: 3, hp: 90 });
    const prompt = findPrompt(s, 'chris009ExploreDamage');
    if (prompt === undefined) throw new Error('no prompt');
    const next = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(next.seats[0]?.exploresLeft).toBe(2);
    expect(next.seats[0]?.exploresRequiredThisTurn).toBe(2);
    expect(next.seats[0]?.weaponDamageBonusThisTurn).toBe(10);
  });

  it('declining grants nothing and leaves no debt', () => {
    const s = turn(CH009, { level: 1, decorations: 3, hp: 90 });
    const prompt = findPrompt(s, 'chris009ExploreDamage');
    if (prompt === undefined) throw new Error('no prompt');
    const next = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 1 });
    expect(next.seats[0]?.exploresLeft).toBe(1);
    expect(next.seats[0]?.exploresRequiredThisTurn).toBeUndefined();
    expect(next.seats[0]?.weaponDamageBonusThisTurn).toBe(0);
  });

  it('blocks endTurn until two Explores are spent, then pays down', () => {
    const fresh = turn(CH009, { level: 1, decorations: 3, hp: 90, turnAmmo: 40 });
    const p = findPrompt(fresh, 'chris009ExploreDamage');
    if (p === undefined) throw new Error('no prompt');
    let next = applyAction(fresh, { type: 'chooseOption', seat: 0, promptId: p.id, option: 0 });
    expect(() => applyAction(next, { type: 'endTurn', seat: 0 })).toThrow();

    const { state: withGun, id: gun } = addCard(next, 0, 'we-009');
    const { state: reTopped, ids } = setMansionTop(withGun, ['ma-005']);
    next = applyAction(reTopped, { type: 'explore', seat: 0, weapons: [gun], exploreCount: 1 });
    expect(next.seats[0]?.exploresRequiredThisTurn).toBe(1);
    expect(next.seats[0]?.attached).toContain(ids[0]);
    expect(() => applyAction(next, { type: 'endTurn', seat: 0 })).toThrow();

    const { state: reTopped2, ids: ids2 } = setMansionTop(next, ['ma-005']);
    const { state: withGun2, id: gun2 } = addCard(reTopped2, 0, 'we-009');
    const after2 = applyAction(withGun2, { type: 'explore', seat: 0, weapons: [gun2], exploreCount: 1 });
    expect(after2.seats[0]?.exploresRequiredThisTurn).toBe(0);
    expect(after2.seats[0]?.attached).toContain(ids2[0]);
    const ended = applyAction(after2, { type: 'endTurn', seat: 0 });
    expect(ended.version).toBeGreaterThan(after2.version);
  });
});

// ---------------------------------------------------------------------------
// CH-008 L1 — +10 / +20 Damage this turn
// ---------------------------------------------------------------------------

describe('CH-008 L1: +10 Damage once an Infected has dealt Damage this round', () => {
  it('is 0, 10 or 20 depending on the round flag and a face-down Character', () => {
    const base = turn(CH008, { level: 1, decorations: 2, hp: 90 }, 0, 2);
    expect(chrisL1TurnDamageBonus(base, 0)).toBe(0);

    const flagged = { ...base, infectedDamageThisRound: true };
    expect(chrisL1TurnDamageBonus(flagged, 0)).toBe(10);

    const downed = {
      ...flagged,
      seats: flagged.seats.map((s, i) => (i === 0 ? s : { ...s, downed: true })),
    };
    expect(chrisL1TurnDamageBonus(downed, 0)).toBe(20);
  });

  it('does not apply below level 1', () => {
    const base = turn(CH008, { level: 0, decorations: 0, hp: 90 });
    expect(chrisL1TurnDamageBonus({ ...base, infectedDamageThisRound: true }, 0)).toBe(0);
  });

  it("an Infected that deals Damage during another seat's turn arms it for Chris's next turn", () => {
    // Chris sits at seat 1, so seat 0's turn happens first in the round.
    let s = game(CH008, { level: 1, decorations: 2 }, 2, 1);
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004'); // 5 damage
    const { state: topped, ids } = setMansionTop(withKnife, ['ma-004']); // 25 HP / 20 attack
    s = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(s.infectedDamageThisRound).toBe(true);
    expect(s.seats[0]?.hp).toBe(50); // Claire 70 - 20

    s = applyAction(s, { type: 'endTurn', seat: 0 });
    expect(s.activeSeat).toBe(1);
    // endTurn only advances the seat; startTurn builds the new turn's pools.
    s = startTurn(s);
    expect(s.seats[1]?.weaponDamageBonusThisTurn).toBe(10);
    void ids;
  });
});

// ---------------------------------------------------------------------------
// CH-008 L2 — not-defeated Infected goes on top of the Mansion
// ---------------------------------------------------------------------------

describe('CH-008 L2: a not-defeated Infected goes on top of the Mansion', () => {
  it('puts the survivor on top of the deck', () => {
    const s = clearTurnStartPrompts(turn(CH008, { level: 2, decorations: 7, hp: 90, turnAmmo: 0 }));
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004'); // 5 < 25 HP
    const { state: topped, ids } = setMansionTop(withKnife, ['ma-004']);
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(next.mansionDeck[0]).toBe(ids[0]);
    expect(next.seats[0]?.hp).toBe(70); // 90 - 20
  });

  it('only does it once per round (a second survivor goes to the bottom)', () => {
    const s = clearTurnStartPrompts(turn(CH008, { level: 2, decorations: 7, hp: 90, turnAmmo: 0, exploresLeft: 2 }));
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: topped, ids } = setMansionTop(withKnife, ['ma-004', 'ma-004']);
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 2 });
    // Exactly one of the two survivors is on top (the first revealed).
    expect(next.mansionDeck[0]).toBe(ids[0]);
    expect(next.mansionDeck[1]).not.toBe(ids[1]);
  });

  it('is not offered below level 2', () => {
    const s = turn(CH008, { level: 1, decorations: 2, hp: 90 });
    expect(chrisL2TopOfMansion(s, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CH-007 L1 — once per round, -10 Damage and an Ammo x10
// ---------------------------------------------------------------------------

describe('CH-007 L1: the first Infected hit each round is lowered by 10', () => {
  it('lowers the damage and grants an Ammo x10', () => {
    const s = clearTurnStartPrompts(turn(CH007, { level: 1, decorations: 3, hp: 90, turnAmmo: 0 }));
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004'); // 5 < 25 HP
    const { state: topped, ids } = setMansionTop(withKnife, ['ma-004']); // 20 attack
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(80); // 90 - (20 - 10)
    expect(next.seats[0]?.discard.some(id => next.cards[id]?.cardId === 'am-001')).toBe(true);
    expect(next.seats[0]?.roundUsedAbilities?.infectedDamageReductionOncePerRoundGainAmmo).toBe(true);
    void ids;
  });

  it('does not apply at level 0', () => {
    const s = clearTurnStartPrompts(turn(CH007, { level: 0, decorations: 0, hp: 90, turnAmmo: 0 }));
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: topped } = setMansionTop(withKnife, ['ma-004']);
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(70); // full 20 damage
    expect(next.seats[0]?.discard.some(id => next.cards[id]?.cardId === 'am-001')).toBe(false);
  });

  it('applies only once per round', () => {
    const s = clearTurnStartPrompts(turn(CH007, { level: 1, decorations: 3, hp: 90, turnAmmo: 0, exploresLeft: 2 }));
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: topped } = setMansionTop(withKnife, ['ma-004']);
    const first = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(first.seats[0]?.hp).toBe(80);

    const { state: withKnife2, id: knife2 } = addCard(first, 0, 'we-004');
    const { state: reTopped } = setMansionTop(withKnife2, ['ma-004']);
    const second = applyAction(reTopped, { type: 'explore', seat: 0, weapons: [knife2], exploreCount: 1 });
    expect(second.seats[0]?.hp).toBe(60); // full 20 damage the second time
  });
});

// ---------------------------------------------------------------------------
// CH-007 L2 — once per turn, trashing a card draws one
// ---------------------------------------------------------------------------

describe('CH-007 L2: trashing a card during your turn draws one', () => {
  /** Explore with a Grenade (trashed after use) into a 10-HP infected. */
  function exploreWithGrenade(level: 0 | 1 | 2) {
    const s = clearTurnStartPrompts(turn(CH007, { level, decorations: level >= 2 ? 6 : 3, hp: 90, turnAmmo: 0 }));
    const { state: withGrenade, id: grenade } = addCard(s, 0, 'we-001'); // 15 damage, trashAfterUse
    const { state: topped } = setMansionTop(withGrenade, ['ma-005']); // 10 HP
    const handBefore = topped.seats[0]?.hand.length ?? 0;
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [grenade], exploreCount: 1 });
    return { next, handBefore };
  }

  it('draws a card when a card is trashed', () => {
    const { next, handBefore } = exploreWithGrenade(2);
    // The grenade left the hand (trashed after use) and the draw replaced it.
    expect(next.seats[0]?.hand.length).toBe(handBefore);
    expect(next.usedStartOfTurnAbilities?.drawCardOnTrashOncePerTurn).toBe(true);
  });

  it('does not draw at level 1', () => {
    const { next, handBefore } = exploreWithGrenade(1);
    expect(next.seats[0]?.hand.length).toBe(handBefore - 1); // the grenade is gone, no draw
    expect(next.usedStartOfTurnAbilities?.drawCardOnTrashOncePerTurn).toBeUndefined();
  });
});
