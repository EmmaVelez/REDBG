import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * Custom character line — CU-002 Parker Luciani and CU-003 Quint Cetcham.
 * Parker: L1 shotguns -10 Ammo Requirement; L2 shotguns +10 Damage per
 *         Infected he is Battling.
 * Quint:  L1 during your turn, gain 1 "Explosive" Weapon (market top);
 *         L2 during your turn, look at another Player's Hand and Discard a
 *         card you choose.
 */

const PARKER = CUSTOM_CARDS.find(c => c.id === 'cu-002');
const QUINT = CUSTOM_CARDS.find(c => c.id === 'cu-003');

function gameFor(characterCardId: string, over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 23,
      players: [
        { name: 'Hero', controller: 'human', characterCardId },
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

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

function findHand(s: GameState, cardId: string, seat = 0): string {
  const id = (s.seats[seat]?.hand ?? []).find(hid => s.cards[hid]?.cardId === cardId);
  if (id === undefined) throw new Error(`card ${cardId} not in hand of seat ${seat}`);
  return id;
}

// ---------------------------------------------------------------------------
// CU-002 Parker Luciani
// ---------------------------------------------------------------------------

describe('CU-002 Parker Luciani data', () => {
  it('matches the printed card', () => {
    expect(PARKER).toEqual(expect.objectContaining({
      id: 'cu-002',
      name: 'Parker Luciani',
      type: 'character',
      set: 'custom',
      copies: 1,
      maxHp: 100,
      level1At: 2,
      level2At: 6,
    }));
    expect(PARKER?.abilities).toEqual([
      { kind: 'ammoReqReduction', tag: 'shotgun', amount: 10, level: 1 },
      { kind: 'weaponTagPlusDamagePerInfectedBattled', tag: 'shotgun', amount: 10, level: 2 },
    ]);
    expect(PARKER?.levels).toHaveLength(2);
  });

  it('joins the deal pool only when the room selected the custom cards', () => {
    expect(cardsForScenario('firstTimer').some(c => c.id === 'cu-002')).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['cu-002'] });
    expect(on.some(c => c.id === 'cu-002')).toBe(true);
  });

  it('setup deals him with 100 Health', () => {
    const s = gameFor('cu-002');
    expect(s.seats[0]?.maxHp).toBe(100);
    expect(s.seats[0]?.hp).toBe(100);
  });
});

describe('CU-002 L1 — Shotguns get -10 Ammo Requirement', () => {
  // we-013 Pump-Action Shotgun: ammoReq 40, damage 25.
  it('charges 30 (not 40) Ammo for a Shotgun at Level 1', () => {
    const s = mansionTop(gameFor('cu-002', { level: 1, decorations: 2, turnAmmo: 40 }), 'ma-009');
    const shotgun = addToZone(s, 0, 'we-013', 'hand');
    const weapon = findHand(shotgun, 'we-013');
    const next = applyAction(shotgun, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    // 25 damage < 30 HP of Mimicry Marcus: not defeated, but the charge is 30.
    expect(next.seats[0]?.turnAmmo).toBe(10);
  });

  it('charges the full 40 Ammo below the L1 gate', () => {
    const s = mansionTop(gameFor('cu-002', { level: 0, decorations: 0, turnAmmo: 40 }), 'ma-009');
    const shotgun = addToZone(s, 0, 'we-013', 'hand');
    const weapon = findHand(shotgun, 'we-013');
    const next = applyAction(shotgun, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(next.seats[0]?.turnAmmo).toBe(0);
  });

  it('does not discount non-Shotgun weapons', () => {
    const s = mansionTop(gameFor('cu-002', { level: 1, decorations: 2, turnAmmo: 40 }), 'ma-001');
    const withGun = addToZone(s, 0, 'we-009', 'hand'); // Handgun: ammoReq 20, pistol tag
    const weapon = findHand(withGun, 'we-009');
    const next = applyAction(withGun, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(next.seats[0]?.turnAmmo).toBe(20);
  });
});

describe('CU-002 L2 — Shotguns get +10 Damage per Infected Battled', () => {
  // ma-009 Mimicry Marcus: 30 HP, 25 attack. Shotgun base 25.
  it('defeats a 30-HP Infected with one Shotgun (25 + 10)', () => {
    const s = mansionTop(gameFor('cu-002', { level: 2, decorations: 6, turnAmmo: 40 }), 'ma-009');
    const withGun = addToZone(s, 0, 'we-013', 'hand');
    const weapon = findHand(withGun, 'we-013');
    const next = applyAction(withGun, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(100); // defeated -> no hit taken
    expect(next.seats[0]?.decorations).toBeGreaterThanOrEqual(8);
  });

  it('at L1 the same attack fails (25 < 30)', () => {
    const s = mansionTop(gameFor('cu-002', { level: 1, decorations: 2, turnAmmo: 40 }), 'ma-009');
    const withGun = addToZone(s, 0, 'we-013', 'hand');
    const weapon = findHand(withGun, 'we-013');
    const next = applyAction(withGun, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBeLessThan(100);
  });

  it('multi-explore: +10 per Shotgun per Infected (25 + 2x10 beats two Majini)', () => {
    let s = gameFor('cu-002', { level: 2, decorations: 6, turnAmmo: 40, exploresLeft: 2 });
    s = mansionTop(s, 'ma-001');
    s = mansionTop(s, 'ma-001'); // combined 40 HP
    const withGun = addToZone(s, 0, 'we-013', 'hand');
    const weapon = findHand(withGun, 'we-013');
    const next = applyAction(withGun, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 2 });
    expect(next.seats[0]?.hp).toBe(100); // 45 >= 40
  });

  it('at L1 the multi-explore fails (25 < 40)', () => {
    let s = gameFor('cu-002', { level: 1, decorations: 2, turnAmmo: 40, exploresLeft: 2 });
    s = mansionTop(s, 'ma-001');
    s = mansionTop(s, 'ma-001');
    const withGun = addToZone(s, 0, 'we-013', 'hand');
    const weapon = findHand(withGun, 'we-013');
    const next = applyAction(withGun, { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 2 });
    expect(next.seats[0]?.hp).toBeLessThan(100);
  });

  it('the picker preview agrees with the resolved multi-explore damage', () => {
    let s = gameFor('cu-002', { level: 2, decorations: 6, turnAmmo: 40, exploresLeft: 2 });
    s = mansionTop(s, 'ma-001');
    s = mansionTop(s, 'ma-001');
    const withGun = addToZone(s, 0, 'we-013', 'hand');
    const weapon = findHand(withGun, 'we-013');
    expect(exploreDamage(withGun, 0, [weapon], 'main', undefined, 2)).toBe(45);
    expect(exploreDamage(withGun, 0, [weapon], 'main', undefined, 1)).toBe(35);
  });

  it('non-Shotgun weapons get no bonus', () => {
    const s = mansionTop(gameFor('cu-002', { level: 2, decorations: 6, turnAmmo: 40 }), 'ma-009');
    const withGun = addToZone(s, 0, 'we-013', 'hand');
    const withBow = addToZone(withGun, 0, 'we-002', 'hand'); // Longbow: 25 dmg, gun tag only
    const shotgun = findHand(withBow, 'we-013');
    const bow = findHand(withBow, 'we-002');
    // Longbow (25 dmg) alone cannot beat 30 HP even at L2.
    const next = applyAction(withBow, { type: 'explore', seat: 0, weapons: [bow], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBeLessThan(100);
    // Shotgun alone does (25 + 10).
    const next2 = applyAction(withBow, { type: 'explore', seat: 0, weapons: [shotgun], exploreCount: 1 });
    expect(next2.seats[0]?.hp).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// CU-003 Quint Cetcham
// ---------------------------------------------------------------------------

describe('CU-003 Quint Cetcham data', () => {
  it('matches the printed card', () => {
    expect(QUINT).toEqual(expect.objectContaining({
      id: 'cu-003',
      name: 'Quint Cetcham',
      type: 'character',
      set: 'custom',
      copies: 1,
      maxHp: 70,
      level1At: 1,
      level2At: 7,
    }));
    expect(QUINT?.abilities).toEqual([
      { kind: 'gainMarketWeaponWithTagDuringTurn', tag: 'explosive', level: 1 },
      { kind: 'peekHandDiscardChosenCard', level: 2 },
    ]);
    expect(QUINT?.levels).toHaveLength(2);
  });

  it('setup deals him with 70 Health', () => {
    const s = gameFor('cu-003');
    expect(s.seats[0]?.maxHp).toBe(70);
    expect(s.seats[0]?.hp).toBe(70);
  });
});

describe('CU-003 L1 — gain 1 "Explosive" Weapon during your turn', () => {
  // The first-timer market has the Grenade pile ('grn', we-001 explosive).
  function grenadeTop(s: GameState): { s: GameState; pileId: string; top: string } {
    const entry = Object.entries(s.marketPiles).find(([, pile]) => {
      const top = pile.cards[0];
      return top !== undefined && (s.cardDefs[s.cards[top]?.cardId ?? '']?.weaponTags ?? []).includes('explosive');
    });
    if (entry === undefined) throw new Error('no explosive pile top in fixture');
    const [pileId, pile] = entry;
    return { s, pileId, top: pile.cards[0]! };
  }

  it('raises a market-top prompt and moves the chosen weapon to Discard', () => {
    const base = gameFor('cu-003', { level: 1, decorations: 1 });
    const { pileId, top } = grenadeTop(base);
    const armed = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const prompt = findPrompt(armed, 'gainMarketWeaponWithTag');
    expect(prompt).toBeDefined();
    expect(prompt?.options).toContain(top);
    const idx = prompt!.options.indexOf(top);
    const after = applyAction(armed, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: idx });
    expect(after.seats[0]?.discard).toContain(top);
    expect(after.marketPiles[pileId]?.cards).not.toContain(top);
    expect(after.marketPiles[pileId]?.cards.length).toBe(base.marketPiles[pileId]!.cards.length - 1);
  });

  it('Decline takes nothing', () => {
    const base = gameFor('cu-003', { level: 1, decorations: 1 });
    const armed = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const prompt = findPrompt(armed, 'gainMarketWeaponWithTag')!;
    const decline = prompt.options.indexOf('Decline');
    const after = applyAction(armed, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: decline });
    expect(after.seats[0]?.discard).toEqual(base.seats[0]?.discard);
  });

  it('is once per turn', () => {
    const base = gameFor('cu-003', { level: 1, decorations: 1 });
    const armed = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const prompt = findPrompt(armed, 'gainMarketWeaponWithTag')!;
    const after = applyAction(armed, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    const second = validateAction(after, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(second.ok).toBe(false);
  });

  it('is rejected when no market pile top is an Explosive weapon', () => {
    const base = gameFor('cu-003', { level: 1, decorations: 1 });
    // Empty every pile whose top carries the explosive tag.
    const marketPiles = { ...base.marketPiles };
    for (const [pileId, pile] of Object.entries(marketPiles)) {
      const top = pile.cards[0];
      if (top !== undefined && (base.cardDefs[base.cards[top]?.cardId ?? '']?.weaponTags ?? []).includes('explosive')) {
        marketPiles[pileId] = { pileId, cards: [] };
      }
    }
    const cleared = { ...base, marketPiles };
    const res = validateAction(cleared, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(res.ok).toBe(false);
  });

  it('is locked below the L1 gate', () => {
    const base = gameFor('cu-003', { level: 0, decorations: 0 });
    const res = validateAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(res.ok).toBe(false);
  });
});

describe('CU-003 L2 — peek a Hand and Discard a chosen card', () => {
  it('chooses a player, reveals their hand, then discards the chosen card', () => {
    const base = gameFor('cu-003', { level: 2, decorations: 7 });
    const victimHand = [...base.seats[1]!.hand];
    expect(victimHand.length).toBeGreaterThan(0);

    const armed = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const p1 = findPrompt(armed, 'quintPeekHandChoosePlayer');
    expect(p1).toBeDefined();
    expect(p1?.options).toEqual(['1']);

    const peeked = applyAction(armed, { type: 'chooseOption', seat: 0, promptId: p1!.id, option: 0 });
    const p2 = findPrompt(peeked, 'quintDiscardChosen');
    expect(p2).toBeDefined();
    expect(p2?.options).toEqual(victimHand);
    // The peek is recorded as a reveal on the logged action (overlay feed).
    const logged = peeked.log[peeked.log.length - 1];
    expect((logged as { reveals?: unknown[] } | undefined)?.reveals?.length).toBe(victimHand.length);

    const pick = victimHand[0]!;
    const after = applyAction(peeked, { type: 'chooseOption', seat: 0, promptId: p2!.id, option: 0 });
    expect(after.seats[1]?.hand).not.toContain(pick);
    expect(after.seats[1]?.discard).toContain(pick);
    // The ACTOR answers both prompts; the victim never acts.
    expect(after.prompts).toHaveLength(0);
  });

  it('is once per turn', () => {
    const base = gameFor('cu-003', { level: 2, decorations: 7 });
    const armed = applyAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const p1 = findPrompt(armed, 'quintPeekHandChoosePlayer')!;
    const peeked = applyAction(armed, { type: 'chooseOption', seat: 0, promptId: p1.id, option: 0 });
    const p2 = findPrompt(peeked, 'quintDiscardChosen')!;
    const after = applyAction(peeked, { type: 'chooseOption', seat: 0, promptId: p2.id, option: 0 });
    const second = validateAction(after, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(second.ok).toBe(false);
  });

  it('is rejected when the only other player is downed', () => {
    const base = gameFor('cu-003', { level: 2, decorations: 7 });
    const downed = {
      ...base,
      seats: base.seats.map(s => (s.seat === 1 ? { ...s, downed: true } : s)),
    };
    const res = validateAction(downed, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(res.ok).toBe(false);
  });

  it('is rejected when the other player has an empty hand', () => {
    const base = gameFor('cu-003', { level: 2, decorations: 7 });
    const empty = {
      ...base,
      seats: base.seats.map(s => (s.seat === 1 ? { ...s, hand: [] } : s)),
    };
    const res = validateAction(empty, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(res.ok).toBe(false);
  });

  it('is locked below the L2 gate', () => {
    const base = gameFor('cu-003', { level: 1, decorations: 3 });
    const res = validateAction(base, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(res.ok).toBe(false);
  });
});
