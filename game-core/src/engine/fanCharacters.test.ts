import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState, SkillEffect } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { exploreDamage } from './explore';
import { exploreAmmoReq } from './ammo';
import { ammoReqForWeapon, effectiveWeaponTags, isPistolWeapon } from './abilities';
import { exploreSkillDamageBonus } from './skill';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * Fan character line — LK-001 Leon (Dual Wield / Rapid Fire),
 * CR-001 Claire (Tactician / Specialist), CC-001 Claire (Shotgun).
 */

function fanGame(charId: string, over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: charId },
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
function addWeapon(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea'): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0 } } };
  const seats = s.seats.map((p, i) => {
    if (i !== seat) return p;
    return zone === 'hand' ? { ...p, hand: [...p.hand, id] } : { ...p, playArea: [...p.playArea, id] };
  });
  return { state: { ...s, cards, seats }, id };
}

function withWeapons(s: GameState, seat: number, cardIds: readonly string[], zone: 'hand' | 'playArea' = 'hand'): { state: GameState; ids: string[] } {
  let out = s;
  const ids: string[] = [];
  for (const c of cardIds) {
    const r = addWeapon(out, seat, c, zone);
    out = r.state;
    ids.push(r.id);
  }
  return { state: out, ids };
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

const LEON = CUSTOM_CARDS.find(c => c.id === 'lk-001');
const CLAIRE_T = CUSTOM_CARDS.find(c => c.id === 'cr-001');
const CLAIRE_S = CUSTOM_CARDS.find(c => c.id === 'cc-001');

describe('fan character data', () => {
  it('LK-001 matches the printed card', () => {
    expect(LEON).toEqual(expect.objectContaining({
      id: 'lk-001', name: 'Leon S. Kennedy', type: 'character', set: 'custom',
      copies: 1, maxHp: 90, level1At: 1, level2At: 8,
    }));
    expect(LEON?.abilities).toEqual([
      { kind: 'plusDamagePerPistolUsed', amount: 5, threshold: 2, level: 1 },
      { kind: 'playAreaCardsArePistols', level: 2 },
    ]);
  });

  it('CR-001 matches the printed card', () => {
    expect(CLAIRE_T).toEqual(expect.objectContaining({
      id: 'cr-001', name: 'Claire Redfield', type: 'character', set: 'custom',
      copies: 1, maxHp: 70, level1At: 0, level2At: 7,
    }));
    expect(CLAIRE_T?.abilities).toEqual([
      { kind: 'plusBuyPassive', amount: 1, level: 1 },
      { kind: 'turnStartActionsForBuy', actions: 2, buy: 2, level: 2 },
    ]);
  });

  it('CC-001 matches the printed card', () => {
    expect(CLAIRE_S).toEqual(expect.objectContaining({
      id: 'cc-001', name: 'Claire Redfield', type: 'character', set: 'custom',
      copies: 1, maxHp: 90, level1At: 2, level2At: 5,
    }));
    expect(CLAIRE_S?.abilities).toEqual([
      { kind: 'ammoReqReduction', tag: 'shotgun', amount: 10, level: 1 },
      { kind: 'healOnDefeatWithWeaponTag', tag: 'shotgun', heal: 5, level: 2 },
    ]);
  });

  it('joins the deal pool only when the room selected it', () => {
    expect(cardsForScenario('firstTimer').some(c => c.id === 'lk-001')).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['lk-001', 'cr-001', 'cc-001'] });
    expect(on.some(c => c.id === 'lk-001')).toBe(true);
    expect(on.some(c => c.id === 'cr-001')).toBe(true);
    expect(on.some(c => c.id === 'cc-001')).toBe(true);
  });
});

describe('LK-001 L1 — Dual Wield', () => {
  it('adds +5 per pistol when 2 or more pistols are used', () => {
    const { state, ids } = withWeapons(fanGame('lk-001', { level: 1, turnAmmo: 40 }), 0, ['we-009', 'we-009']);
    // 2 Handguns = 20 damage, +5 x 2 pistols = 10.
    expect(exploreDamage(state, 0, ids)).toBe(30);
  });

  it('adds nothing with fewer than 2 pistols', () => {
    const { state, ids } = withWeapons(fanGame('lk-001', { level: 1, turnAmmo: 20 }), 0, ['we-009', 'we-004']);
    // Handgun (pistol) + Combat Knife (melee) = 15, no bonus.
    expect(exploreDamage(state, 0, ids)).toBe(15);
  });

  it('scales with 3 pistols', () => {
    const { state, ids } = withWeapons(fanGame('lk-001', { level: 1, turnAmmo: 60 }), 0, ['we-009', 'we-009', 'we-009']);
    // 30 damage + 5 x 3 = 45.
    expect(exploreDamage(state, 0, ids)).toBe(45);
  });

  it('is level-gated: Level 0 has no Dual Wield', () => {
    const { state, ids } = withWeapons(fanGame('lk-001', { level: 0, turnAmmo: 40 }), 0, ['we-009', 'we-009']);
    expect(exploreDamage(state, 0, ids)).toBe(20);
  });
});

describe('LK-001 L2 — Rapid Fire', () => {
  it('labels a play-area weapon as a pistol', () => {
    const { state, id } = addWeapon(fanGame('lk-001', { level: 2 }), 0, 'we-013', 'playArea'); // Pump-Action Shotgun
    expect(isPistolWeapon(state, 0, id)).toBe(true);
    expect(effectiveWeaponTags(state, 0, id)).toContain('pistol');
    // the printed tags are untouched
    expect(state.cardDefs['we-013']?.weaponTags).not.toContain('pistol');
  });

  it('does not relabel a card in hand', () => {
    const { state, id } = addWeapon(fanGame('lk-001', { level: 2 }), 0, 'we-013', 'hand');
    expect(isPistolWeapon(state, 0, id)).toBe(false);
  });

  it('is level-gated', () => {
    const { state, id } = addWeapon(fanGame('lk-001', { level: 1 }), 0, 'we-013', 'playArea');
    expect(isPistolWeapon(state, 0, id)).toBe(false);
  });

  it('reaches ammo discounts', () => {
    const abilities = [{ kind: 'ammoReqReduction', tag: 'pistol', amount: 10, level: 1 } as const];
    const shotgun = { id: 'we-013', type: 'weapon', weaponTags: ['gun', 'shotgun'], ammoReq: 40, damage: 25 } as unknown as CardDef;
    expect(ammoReqForWeapon(abilities, shotgun)).toBe(40);
    expect(ammoReqForWeapon(abilities, shotgun, ['pistol'])).toBe(30);
  });

  it('labels the weapons PLAYED in an explore as pistols, so L1 triggers with any two', () => {
    const { state, ids } = withWeapons(fanGame('lk-001', { level: 2, turnAmmo: 100 }), 0, ['we-013', 'we-005']);
    // Pump-Action Shotgun (25) + Survival Knife (10) = 35, +5 x 2 "pistols" = 45.
    expect(exploreDamage(state, 0, ids)).toBe(45);
  });

  it('still needs the L1 threshold: one played weapon is not enough', () => {
    const { state, ids } = withWeapons(fanGame('lk-001', { level: 2, turnAmmo: 100 }), 0, ['we-013']);
    expect(exploreDamage(state, 0, ids)).toBe(25);
  });

  it('does not apply below level 2', () => {
    const { state, ids } = withWeapons(fanGame('lk-001', { level: 1, turnAmmo: 100 }), 0, ['we-013', 'we-005']);
    expect(exploreDamage(state, 0, ids)).toBe(35);
  });

  it('reaches the explore reducer: the bonus is real damage, not just a preview', () => {
    const s = fanGame('lk-001', { level: 2, hp: 80, turnAmmo: 100 });
    const withInf = mansionTop(s, 'ma-006'); // Bui Kichwa: 40 HP
    const { state, ids } = withWeapons(withInf, 0, ['we-013', 'we-005']);
    const next = applyAction(state, { type: 'explore', seat: 0, weapons: ids, exploreCount: 1 });
    // 45 damage defeats the 40 HP Infected, so Leon takes nothing.
    expect(next.seats[0]?.hp).toBe(80);
  });

  it('without L2 the same explore cannot defeat that Infected', () => {
    const s = fanGame('lk-001', { level: 1, hp: 80, turnAmmo: 100 });
    const withInf = mansionTop(s, 'ma-006'); // 40 HP, 30 attack
    const { state, ids } = withWeapons(withInf, 0, ['we-013', 'we-005']);
    const next = applyAction(state, { type: 'explore', seat: 0, weapons: ids, exploreCount: 1 });
    // 35 damage leaves it standing: Leon takes the 30 attack.
    expect(next.seats[0]?.hp).toBe(50);
  });

  it('reaches Skill damage (SK-030 counts a play-area shotgun as a pistol)', () => {
    const { state, id } = addWeapon(fanGame('lk-001', { level: 2 }), 0, 'we-013', 'playArea');
    const defs = [state.cardDefs['we-013']];
    const effects = [{ kind: 'explorePistolPlusDamage', amount: 10 } as SkillEffect];
    expect(exploreSkillDamageBonus(effects, defs)).toBe(0);
    expect(exploreSkillDamageBonus(effects, defs, state, 0, [id])).toBe(10);
  });

  it('reaches weapon reuse (a play-area shotgun counts as a pistol)', async () => {
    const { maxWeaponUses } = await import('./weaponReuse');
    const { state, id } = addWeapon(fanGame('lk-001', { level: 2 }), 0, 'we-013', 'playArea');
    // Leon has no reuse ability, so the shotgun stays at one use.
    expect(maxWeaponUses(state, 0, id)).toBe(1);
  });
});

describe('CR-001 L1 — Tactician (+1 Buy)', () => {
  it('starts the turn with 2 Buys', () => {
    const s = startTurn(fanGame('cr-001', { level: 1 }));
    expect(s.seats[0]?.buysLeft).toBe(2);
  });

  it('is level-gated: Level 0 has 1 Buy', () => {
    const s = startTurn(fanGame('cr-001', { level: 0 }));
    expect(s.seats[0]?.buysLeft).toBe(1);
  });
});

describe('CR-001 L2 — Specialist (+2 Actions, -2 Buy)', () => {
  it('offers the choice at turn start', () => {
    const s = startTurn(fanGame('cr-001', { level: 2 }));
    const prompt = findPrompt(s, 'specialistActionsForBuy');
    expect(prompt).toBeDefined();
    expect(prompt?.options).toEqual(['Yes', 'No']);
  });

  it('accepting grants +2 Actions and removes 2 Buys', () => {
    const s = startTurn(fanGame('cr-001', { level: 2 }));
    const prompt = findPrompt(s, 'specialistActionsForBuy');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const before = s.seats[0];
    const after = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(after.seats[0]?.actionsLeft).toBe((before?.actionsLeft ?? 0) + 2);
    expect(after.seats[0]?.buysLeft).toBe(Math.max((before?.buysLeft ?? 0) - 2, 0));
  });

  it('declining changes nothing', () => {
    const s = startTurn(fanGame('cr-001', { level: 2 }));
    const prompt = findPrompt(s, 'specialistActionsForBuy');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const before = s.seats[0];
    const after = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 1 });
    expect(after.seats[0]?.actionsLeft).toBe(before?.actionsLeft);
    expect(after.seats[0]?.buysLeft).toBe(before?.buysLeft);
  });

  it('is level-gated: Level 1 has no prompt', () => {
    const s = startTurn(fanGame('cr-001', { level: 1 }));
    expect(findPrompt(s, 'specialistActionsForBuy')).toBeUndefined();
  });
});

describe('CC-001 L1 — Shotgun ammo discount', () => {
  it('gives Shotgun weapons -10 Ammo Requirement', () => {
    const { state, id } = addWeapon(fanGame('cc-001', { level: 1 }), 0, 'we-013', 'hand');
    expect(state.cardDefs['we-013']?.ammoReq).toBe(40);
    expect(exploreAmmoReq(state, 0, id, 1)).toBe(30);
  });

  it('does not touch other weapon types', () => {
    const { state, id } = addWeapon(fanGame('cc-001', { level: 1 }), 0, 'we-009', 'hand');
    expect(exploreAmmoReq(state, 0, id, 1)).toBe(20);
  });

  it('is level-gated: Level 0 pays full ammo', () => {
    const { state, id } = addWeapon(fanGame('cc-001', { level: 0 }), 0, 'we-013', 'hand');
    expect(exploreAmmoReq(state, 0, id, 1)).toBe(40);
  });
});

describe('CC-001 L2 — Heal 5 on defeating an Infected with a Shotgun', () => {
  it('heals 5 when the killing blow is a Shotgun', () => {
    const s = fanGame('cc-001', { level: 2, hp: 80, turnAmmo: 80 });
    const withInf = mansionTop(s, 'ma-006'); // Bui Kichwa: 40 HP, 30 attack
    const { state, id } = addWeapon(withInf, 0, 'we-014', 'hand'); // Automatic Shotgun: 50 damage
    const next = applyAction(state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(85);
  });

  it('caps the heal at max Health', () => {
    const s = fanGame('cc-001', { level: 2, hp: 88, turnAmmo: 80 });
    const withInf = mansionTop(s, 'ma-006');
    const { state, id } = addWeapon(withInf, 0, 'we-014', 'hand');
    const next = applyAction(state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(90);
  });

  it('does not heal when the Infected is not defeated', () => {
    const s = fanGame('cc-001', { level: 2, hp: 80, turnAmmo: 40 });
    const withInf = mansionTop(s, 'ma-010'); // Uroboros Aheri: 90 HP, 70 attack
    const { state, id } = addWeapon(withInf, 0, 'we-013', 'hand'); // Pump-Action Shotgun: 25 damage
    const next = applyAction(state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    // not defeated: full 70 damage, no heal
    expect(next.seats[0]?.hp).toBe(10);
  });

  it('does not heal when a non-Shotgun weapon lands the kill', () => {
    const s = fanGame('cc-001', { level: 2, hp: 80, turnAmmo: 70 });
    const withInf = mansionTop(s, 'ma-006'); // 40 HP
    const { state, id } = addWeapon(withInf, 0, 'we-012', 'hand'); // Full-Bore Machine Gun: 40 damage
    const next = applyAction(state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(80);
  });

  it('is level-gated: Level 1 has no heal', () => {
    const s = fanGame('cc-001', { level: 1, hp: 80, turnAmmo: 80 });
    const withInf = mansionTop(s, 'ma-006');
    const { state, id } = addWeapon(withInf, 0, 'we-014', 'hand');
    const next = applyAction(state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 });
    expect(next.seats[0]?.hp).toBe(80);
  });
});
