import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState, CardDef } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { ALL_CARDS, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { plusTagDamage } from './abilities';
import { exploreDamage } from './explore';

/**
 * Official custom print (id ch-005p). Jill Valentine (Pirate, Revelations alternate costume) — printed code
 * CH-005, 70 Health, gates 4 / 7.
 *   L1: All your "Pistol" and "Machine Gun" Weapons get +10 Damage.
 *   L2: When Jill would take any Damage, you can Trash 1 card to negate the
 *       Damage.
 *
 * L1 is wired into the SHARED explore ability-damage term (single- and
 * multi-explore both), the client picker preview (exploreDamage) and the
 * Sherry ally-explore path — the same three sites HUNK's tag bonus uses.
 *
 * L2 is a damage-time choice, implemented the Resuscitate way: the explore
 * holds the Character at her PRE-damage Health and queues a prompt (options
 * are the hand cards + Decline); Accept trashes the chosen card (the damage
 * stays negated), Decline applies the held loss to the CURRENT Health, with
 * flipDown when the hit was lethal. Wired for single- and multi-explore
 * Main-leading damage only — partner-led explores, poison at turn start,
 * trap/barrel damage, off-turn AoE and the Sherry ally-explore / AC-042
 * deferred paths are NOT covered (the same documented gaps as the other B4MC
 * prints; CH-008 L1 lists identical omissions).
 */

const CH005 = 'ch-005p';

function def(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id} in CUSTOM_CARDS`);
  return d;
}

function game(id: string, over: Partial<PlayerState> = {}, seatCount = 1, jillSeat = 0): GameState {
  const players = Array.from({ length: seatCount }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === jillSeat ? id : 'ch-003',
  }));
  const s = setup(
    { seed: 11, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === jillSeat ? { ...p, ...over } : p)) };
}

/** Fresh turn for `seat`, with `over` applied before and after startTurn. */
function turn(id: string, over: Partial<PlayerState> = {}, seat = 0, seatCount = 1, jillSeat = 0): GameState {
  const turned = startTurn(game(id, over, seatCount, jillSeat));
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

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

describe('B4MC Jill Valentine data', () => {
  it('matches the printed card (70 Health, gates 4 / 7)', () => {
    expect(def(CH005)).toEqual(expect.objectContaining({
      id: CH005, name: 'Jill Valentine', type: 'character', set: 'custom', copies: 1,
      maxHp: 70, level1At: 4, level2At: 7,
    }));
    expect(def(CH005).abilities).toEqual([
      { kind: 'plusDamageForWeaponTags', tags: ['pistol', 'machineGun'], amount: 10, level: 1 },
      { kind: 'trashCardToNegateDamage', level: 2 },
    ]);
  });

  it('is not part of ALL_CARDS — the custom-card toggle is the only way in', () => {
    expect(ALL_CARDS.some(c => c.id === CH005)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CH-005 L1 — all "Pistol" and "Machine Gun" Weapons get +10 Damage
// ---------------------------------------------------------------------------

describe('CH-005 L1: +10 Damage to Pistol and Machine Gun weapons', () => {
  it('plusTagDamage awards +10 once per matching weapon and nothing to others', () => {
    const abilities = def(CH005).abilities ?? [];
    const knife: CardDef = { id: 'we-004', name: 'Combat Knife', set: 'premier', text: '', type: 'weapon', copies: 1, weaponTags: ['melee', 'knife'] };
    const handgun: CardDef = { id: 'we-009', name: 'Handgun', set: 'premier', text: '', type: 'weapon', copies: 1, weaponTags: ['gun', 'pistol'] };
    const mg: CardDef = { id: 'we-038', name: 'Machine Pistol', set: 'nightmare', text: '', type: 'weapon', copies: 1, weaponTags: ['gun', 'machineGun'] };
    expect(plusTagDamage(abilities, [])).toBe(0);
    expect(plusTagDamage(abilities, [knife])).toBe(0);
    expect(plusTagDamage(abilities, [handgun])).toBe(10);
    expect(plusTagDamage(abilities, [mg])).toBe(10);
    expect(plusTagDamage(abilities, [knife, handgun, mg, handgun])).toBe(30);
    // A weapon carrying BOTH listed tags still gets the bonus once.
    expect(plusTagDamage(abilities, [{ id: 'x', name: 'X', set: 'custom', text: '', type: 'weapon', copies: 1, weaponTags: ['pistol', 'machineGun'] }])).toBe(10);
  });

  it('the picker preview prices the +10 (Handgun 10 -> 20 at level 1, 10 at level 0)', () => {
    const l0 = turn(CH005, { level: 0, decorations: 0, hp: 70, turnAmmo: 80 });
    const { state: withGun0, id: gun0 } = addCard(l0, 0, 'we-009');
    expect(exploreDamage(withGun0, 0, [gun0])).toBe(10);

    const l1 = turn(CH005, { level: 1, decorations: 4, hp: 70, turnAmmo: 80 });
    const { state: withGun1, id: gun1 } = addCard(l1, 0, 'we-009');
    expect(exploreDamage(withGun1, 0, [gun1])).toBe(20);
  });

  it('two Handguns defeat a 25 HP Infected at level 1 but not at level 0', () => {
    // we-009 Handgun: 10 damage. 10+10 = 20 < 25 HP; with Jill's +10 per
    // Pistol: 30 >= 25 -> the Zombie Butcher is attached, no damage taken.
    const l0 = turn(CH005, { level: 0, decorations: 0, hp: 70, turnAmmo: 80 });
    const { state: withGuns0, id: g1 } = addCard(l0, 0, 'we-009');
    const { state: withGuns0b, id: g2 } = addCard(withGuns0, 0, 'we-009');
    const { state: topped0, ids: ids0 } = setMansionTop(withGuns0b, ['ma-004']);
    const r0 = applyAction(topped0, { type: 'explore', seat: 0, weapons: [g1, g2], exploreCount: 1 });
    expect(r0.seats[0]?.attached).not.toContain(ids0[0]);
    expect(r0.seats[0]?.hp).toBe(50); // 70 - 20 attack

    const l1 = turn(CH005, { level: 1, decorations: 4, hp: 70, turnAmmo: 80 });
    const { state: withGuns1, id: g3 } = addCard(l1, 0, 'we-009');
    const { state: withGuns1b, id: g4 } = addCard(withGuns1, 0, 'we-009');
    const { state: topped1, ids: ids1 } = setMansionTop(withGuns1b, ['ma-004']);
    const r1 = applyAction(topped1, { type: 'explore', seat: 0, weapons: [g3, g4], exploreCount: 1 });
    expect(r1.seats[0]?.attached).toContain(ids1[0]);
    expect(r1.seats[0]?.hp).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// CH-005 L2 — Trash 1 card to negate any Damage she would take
// ---------------------------------------------------------------------------

describe('CH-005 L2: Trash 1 card to negate Damage', () => {
  it('holds her Health and offers the hand cards + Decline when she would take damage', () => {
    const s = turn(CH005, { level: 2, decorations: 7, hp: 70, turnAmmo: 0 });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004'); // 5 < 25 HP
    const { state: withCard, id: trashable } = addCard(withKnife, 0, 'we-009');
    const { state: topped } = setMansionTop(withCard, ['ma-004']); // 20 attack
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });

    const prompt = findPrompt(next, 'jillNegateDamage');
    expect(prompt).toBeDefined();
    expect(prompt?.seat).toBe(0);
    expect(prompt?.text).toBe('Jill would take 20 Damage. Trash 1 card to negate the Damage?');
    expect(prompt?.options).toContain(trashable);
    expect(prompt?.options.at(-1)).toBe('Decline');
    // The damage is NOT applied yet: the Character is held at her pre-damage Health.
    expect(next.seats[0]?.hp).toBe(70);
  });

  it('Accept: trashes the chosen card and keeps the held Health', () => {
    const s = turn(CH005, { level: 2, decorations: 7, hp: 70, turnAmmo: 0 });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: withCard, id: trashable } = addCard(withKnife, 0, 'we-009');
    const { state: topped } = setMansionTop(withCard, ['ma-004']);
    const afterExplore = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    const prompt = findPrompt(afterExplore, 'jillNegateDamage');
    if (prompt === undefined) throw new Error('no prompt');

    const next = applyAction(afterExplore, {
      type: 'chooseOption', seat: 0, promptId: prompt.id,
      option: prompt.options.indexOf(trashable),
    });
    expect(next.seats[0]?.hp).toBe(70);
    expect(next.seats[0]?.downed).toBe(false);
    expect(next.seats[0]?.hand).not.toContain(trashable);
    expect(next.removed).toContain(trashable);
    expect(findPrompt(next, 'jillNegateDamage')).toBeUndefined();
  });

  it('Decline: applies the damage to the current Health', () => {
    const s = turn(CH005, { level: 2, decorations: 7, hp: 70, turnAmmo: 0 });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: withCard } = addCard(withKnife, 0, 'we-009');
    const { state: topped } = setMansionTop(withCard, ['ma-004']);
    const afterExplore = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    const prompt = findPrompt(afterExplore, 'jillNegateDamage');
    if (prompt === undefined) throw new Error('no prompt');

    const next = applyAction(afterExplore, {
      type: 'chooseOption', seat: 0, promptId: prompt.id, option: prompt.options.length - 1,
    });
    expect(next.seats[0]?.hp).toBe(50); // 70 - 20
    expect(next.seats[0]?.hand.some(id => id.startsWith('we-009#'))).toBe(true); // nothing was trashed
  });

  it('Accept on a lethal hit keeps her standing', () => {
    const s = turn(CH005, { level: 2, decorations: 7, hp: 15, turnAmmo: 0 });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: withCard, id: trashable } = addCard(withKnife, 0, 'we-009');
    const { state: topped } = setMansionTop(withCard, ['ma-004']); // 20 damage > 15 HP
    const afterExplore = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(afterExplore.seats[0]?.hp).toBe(15); // held at pre-damage Health
    expect(afterExplore.seats[0]?.downed).toBe(false);
    const prompt = findPrompt(afterExplore, 'jillNegateDamage');
    if (prompt === undefined) throw new Error('no prompt');

    const next = applyAction(afterExplore, {
      type: 'chooseOption', seat: 0, promptId: prompt.id,
      option: prompt.options.indexOf(trashable),
    });
    expect(next.seats[0]?.hp).toBe(15);
    expect(next.seats[0]?.downed).toBe(false);
    expect(next.removed).toContain(trashable);
  });

  it('Decline on a lethal hit downs her', () => {
    const s = turn(CH005, { level: 2, decorations: 7, hp: 15, turnAmmo: 0 });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: withCard } = addCard(withKnife, 0, 'we-009');
    const { state: topped } = setMansionTop(withCard, ['ma-004']);
    const afterExplore = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    const prompt = findPrompt(afterExplore, 'jillNegateDamage');
    if (prompt === undefined) throw new Error('no prompt');

    const next = applyAction(afterExplore, {
      type: 'chooseOption', seat: 0, promptId: prompt.id, option: prompt.options.length - 1,
    });
    expect(next.seats[0]?.hp).toBe(0);
    expect(next.seats[0]?.downed).toBe(true);
  });

  it('is not offered when the hand is empty after the explore', () => {
    // Hand holds ONLY the knife; the explore moves it out of the hand, so
    // handAfter is empty and there is nothing to Trash.
    const s = turn(CH005, { level: 2, decorations: 7, hp: 70, turnAmmo: 0, hand: [] });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: topped } = setMansionTop(withKnife, ['ma-004']);
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(findPrompt(next, 'jillNegateDamage')).toBeUndefined();
    expect(next.seats[0]?.hp).toBe(50); // the damage lands normally
  });

  it('is not offered below level 2', () => {
    const s = turn(CH005, { level: 1, decorations: 4, hp: 70, turnAmmo: 0 });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: withCard } = addCard(withKnife, 0, 'we-009');
    const { state: topped } = setMansionTop(withCard, ['ma-004']);
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 1 });
    expect(findPrompt(next, 'jillNegateDamage')).toBeUndefined();
    expect(next.seats[0]?.hp).toBe(50);
  });

  it('a MULTI-explore queues the same hold + prompt (2 Explores at once)', () => {
    const s = turn(CH005, { level: 2, decorations: 7, hp: 70, turnAmmo: 0, exploresLeft: 2 });
    const { state: withKnife, id: knife } = addCard(s, 0, 'we-004');
    const { state: withCard, id: trashable } = addCard(withKnife, 0, 'we-009');
    const { state: topped } = setMansionTop(withCard, ['ma-004', 'ma-004']); // 20 + 20 attack
    const next = applyAction(topped, { type: 'explore', seat: 0, weapons: [knife], exploreCount: 2 });

    const prompt = findPrompt(next, 'jillNegateDamage');
    expect(prompt).toBeDefined();
    expect(next.seats[0]?.hp).toBe(70); // held
    if (prompt === undefined) throw new Error('no prompt');
    const accepted = applyAction(next, {
      type: 'chooseOption', seat: 0, promptId: prompt.id,
      option: prompt.options.indexOf(trashable),
    });
    expect(accepted.seats[0]?.hp).toBe(70);
    expect(accepted.seats[0]?.downed).toBe(false);
    expect(accepted.removed).toContain(trashable);
  });
});