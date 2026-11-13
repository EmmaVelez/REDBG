import { describe, expect, it } from 'vitest';
import type { CardInstance, CharacterAbility, GameState, PlayerState, SkillEffect } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { exploreDamage, resolveMultiExplore } from './explore';
import { maxWeaponUses, remainingWeaponUses } from './weaponReuse';
import { activeSkillEffects, buildSkillDeck, exploreExplosiveDamage, exploreSkillDamageBonus } from './skill';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * SK-034..SK-036 — the fan-designed "Bomber" Skill line for the Mercenaries
 * Skill System:
 *
 *   SK-034 Bomber LV.1 (3 XP): When your Character Explores, "Explosive"
 *     Weapons deal +5 Damage.
 *   SK-035 Bomber LV.2 (5 XP): When your Character Explores, "Explosive"
 *     Weapons can be used 1 additional time before being Trashed.
 *   SK-036 Bomber LV.3 (7 XP): When your Character Explores, "Explosive"
 *     Weapons deal Damage to all Revealed Infected at the same time.
 *
 * Selecting them in the room's Custom Cards puts them in the game's def pool;
 * `buildSkillDeck` then deals every skill-type def, so they join the
 * Mercenaries Skill deck like the official SK-001..SK-030 cards.
 *
 * SK-034 is exercised through the shared `exploreDamage` helper (the client
 * picker's preview) AND a real explore in `applyAction`. SK-035 is exercised
 * through `maxWeaponUses` AND the explore reducer's trash-after-use disposal.
 */

const SKILLS = CUSTOM_CARDS.filter(c => c.type === 'skill');
const SK034 = SKILLS.find(c => c.id === 'sk-034');
const SK035 = SKILLS.find(c => c.id === 'sk-035');
const SK036 = SKILLS.find(c => c.id === 'sk-036');

let counter = 0;

function baseGame(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    {
      seed: 11,
      players: [
        { name: 'P', controller: 'human', characterCardId: 'ch-001' },
        { name: 'Foe', controller: 'human', characterCardId: 'ch-003' },
      ],
    },
    [...PREMIER_CARDS, ...SKILLS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function addCard(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea' = 'hand') {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0 } } };
  const seats = s.seats.map((p, i) => (i === seat
    ? {
      ...p,
      hand: zone === 'hand' ? [...p.hand, id] : p.hand,
      playArea: zone === 'playArea' ? [...p.playArea, id] : p.playArea,
    }
    : p));
  return { state: { ...s, cards, seats }, id };
}

/** Inject an (optionally already paid-for) Skill instance into a seat. */
function injectSkill(s: GameState, seat: number, cardId: string, xp: number): GameState {
  const instId = `${cardId}#sk${++counter}`;
  const inst: CardInstance = { instanceId: instId, cardId, xp, location: { zone: 'skillArea', index: 0 } };
  return {
    ...s,
    cards: { ...s.cards, [instId]: inst },
    seats: s.seats.map((p, i) => (i === seat ? { ...p, skills: [...(p.skills ?? []), instId] } : p)),
  };
}

function setMansionTop(s: GameState, cardId: string): GameState {
  const id = `${cardId}#top${++counter}`;
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } },
    mansionDeck: [id, ...s.mansionDeck],
  };
}

describe('Bomber Skill card data', () => {
  it('SK-034 matches the printed card (Bomber LV.1, 3 XP)', () => {
    expect(SK034).toEqual(expect.objectContaining({
      id: 'sk-034',
      name: 'Bomber LV.1',
      type: 'skill',
      skillXp: 3,
      skillFamily: 'Bomber',
      skillLevel: 1,
      skillEffects: [{ kind: 'exploreExplosivePlusDamage', amount: 5 }],
    }));
    expect(SK034?.text).toBe('When your Character Explores, "Explosive" Weapons deal +5 Damage.');
  });

  it('SK-035 matches the printed card (Bomber LV.2, 5 XP)', () => {
    expect(SK035).toEqual(expect.objectContaining({
      id: 'sk-035',
      name: 'Bomber LV.2',
      type: 'skill',
      skillXp: 5,
      skillFamily: 'Bomber',
      skillLevel: 2,
      skillEffects: [{ kind: 'explosiveExtraUse', count: 1 }],
    }));
    expect(SK035?.text).toBe('When your Character Explores, "Explosive" Weapons can be used 1 additional time before being Trashed.');
  });

  it('SK-036 matches the printed card (Bomber LV.3, 7 XP)', () => {
    expect(SK036).toEqual(expect.objectContaining({
      id: 'sk-036',
      name: 'Bomber LV.3',
      type: 'skill',
      skillXp: 7,
      skillFamily: 'Bomber',
      skillLevel: 3,
      skillEffects: [{ kind: 'exploreExplosiveDamageToAllRevealed' }],
    }));
    expect(SK036?.text).toBe('When your Character Explores, "Explosive" Weapons deal Damage to all Revealed Infected at the same time.');
  });

  it('keeps the printed XP cost as the activation requirement', () => {
    expect(SK034?.skillXp).toBe(3);
    expect(SK035?.skillXp).toBe(5);
    expect(SK036?.skillXp).toBe(7);
  });
});

describe('Bomber Skills reach the Mercenaries Skill deck', () => {
  it('are not part of the base card pool', () => {
    for (const id of ['sk-034', 'sk-035', 'sk-036']) {
      expect(PREMIER_CARDS.some(c => c.id === id), id).toBe(false);
    }
  });

  it('join the Skill deck when the room selects them', () => {
    const cards = cardsForScenario('firstTimer', {
      skillSystem: true,
      customCards: ['sk-034', 'sk-035', 'sk-036'],
    });
    const deck = buildSkillDeck(cards);
    expect(deck).toContain('sk-034#1');
    expect(deck).toContain('sk-035#1');
    expect(deck).toContain('sk-036#1');
  });

  it('stay out of the deck when the room does not select them', () => {
    const deck = buildSkillDeck(cardsForScenario('firstTimer', { skillSystem: true }));
    expect(deck).not.toContain('sk-034#1');
    expect(deck).not.toContain('sk-035#1');
    expect(deck).not.toContain('sk-036#1');
  });

  it('never create a market/Mansion pile (skills are dealt by the draft)', () => {
    const cards = cardsForScenario('firstTimer', { skillSystem: true, customCards: ['sk-034'] });
    const sk = cards.find(c => c.id === 'sk-034');
    expect(sk?.cost).toBeUndefined();
  });
});

describe('SK-034 Bomber LV.1 — +5 Damage to "Explosive" weapons on Explore', () => {
  it('adds +5 to an Explosive weapon (exploreDamage preview)', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-034', 3);
    const g = addCard(s, 0, 'we-001'); // Grenade, 15 damage
    expect(exploreDamage(g.state, 0, [g.id])).toBe(20);
  });

  it('does not touch non-Explosive weapons', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-034', 3);
    const h = addCard(s, 0, 'we-009'); // Handgun, 10 damage
    expect(exploreDamage(h.state, 0, [h.id])).toBe(10);
  });

  it('adds +5 once per Explosive weapon used', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-034', 3);
    const g = addCard(s, 0, 'we-001'); // Grenade 15
    const r = addCard(g.state, 0, 'we-008'); // Rocket Launcher 100
    expect(exploreDamage(r.state, 0, [g.id, r.id])).toBe(15 + 5 + 100 + 5);
  });

  it('is inactive while the Skill has less XP than its requirement', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-034', 2);
    const g = addCard(s, 0, 'we-001');
    expect(activeSkillEffects(g.state, 0)).toEqual([]);
    expect(exploreDamage(g.state, 0, [g.id])).toBe(15);
  });

  it('does nothing without the Skill in the Skill Area', () => {
    let s = baseGame();
    const g = addCard(s, 0, 'we-001');
    expect(exploreDamage(g.state, 0, [g.id])).toBe(15);
  });

  it('flows through the explore reducer (Grenade defeats a 20 HP Majini)', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-034', 3);
    const g = addCard(s, 0, 'we-001');
    s = setMansionTop(g.state, 'ma-001'); // Majini, 20 HP
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id], exploreCount: 1 });
    // 15 base damage would leave it alive; the Skill's +5 makes it an exact kill.
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-001')).toBe(true);
  });

  it('is inert without the Skill (same Majini survives)', () => {
    let s = baseGame();
    const g = addCard(s, 0, 'we-001');
    s = setMansionTop(g.state, 'ma-001'); // Majini, 20 HP
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id], exploreCount: 1 });
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-001')).toBe(false);
    // Sent to the bottom of the Mansion instead.
    expect(next.mansionDeck.some(id => next.cards[id]?.cardId === 'ma-001')).toBe(true);
  });

  it('exploreSkillDamageBonus reads the tag, not the card id', () => {
    const effects = [{ kind: 'exploreExplosivePlusDamage' as const, amount: 5 }];
    const defs = PREMIER_CARDS.filter(c => c.id === 'we-001' || c.id === 'we-009');
    expect(defs).toHaveLength(2);
    expect(exploreSkillDamageBonus(effects, defs)).toBe(5);
  });
});

describe('SK-035 Bomber LV.2 — "Explosive" weapons get 1 extra use before Trash', () => {
  it('raises an Explosive weapon to 2 uses while the Skill is active', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-035', 5);
    const g = addCard(s, 0, 'we-001');
    expect(maxWeaponUses(g.state, 0, g.id)).toBe(2);
    expect(remainingWeaponUses(g.state, 0, g.id)).toBe(2);
  });

  it('leaves non-Explosive weapons at 1 use', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-035', 5);
    const h = addCard(s, 0, 'we-009');
    expect(maxWeaponUses(h.state, 0, h.id)).toBe(1);
  });

  it('is 1 use again once the Skill is inactive', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-035', 4);
    const g = addCard(s, 0, 'we-001');
    expect(maxWeaponUses(g.state, 0, g.id)).toBe(1);
  });

  it('keeps the Explosive weapon in the play area after its first use', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-035', 5);
    const g = addCard(s, 0, 'we-001');
    s = setMansionTop(g.state, 'ma-001');
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id], exploreCount: 1 });
    expect(next.seats[0]?.playArea).toContain(g.id);
    expect(next.removed).not.toContain(g.id);
    expect(remainingWeaponUses(next, 0, g.id)).toBe(1);
  });

  it('trashes the Explosive weapon after its second use', () => {
    let s = baseGame({ exploresLeft: 3 });
    s = injectSkill(s, 0, 'sk-035', 5);
    const g = addCard(s, 0, 'we-001');
    s = setMansionTop(g.state, 'ma-001');
    let next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id], exploreCount: 1 });
    expect(next.seats[0]?.playArea).toContain(g.id);
    next = setMansionTop(next, 'ma-002');
    next = applyAction(next, { type: 'explore', seat: 0, weapons: [g.id], exploreCount: 1 });
    expect(next.seats[0]?.playArea).not.toContain(g.id);
    expect(next.removed).toContain(g.id);
    expect(remainingWeaponUses(next, 0, g.id)).toBe(0);
  });

  it('trashes the Explosive weapon after one use when the Skill is inactive', () => {
    let s = baseGame();
    const g = addCard(s, 0, 'we-001');
    s = setMansionTop(g.state, 'ma-001');
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id], exploreCount: 1 });
    expect(next.seats[0]?.playArea).not.toContain(g.id);
    expect(next.removed).toContain(g.id);
  });

  it('can spend both uses in a single explore (declared twice)', () => {
    let s = baseGame();
    s = injectSkill(s, 0, 'sk-035', 5);
    const g = addCard(s, 0, 'we-001');
    s = setMansionTop(g.state, 'ma-004'); // Zombie Butcher, 25 HP
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id, g.id], exploreCount: 1 });
    // 2 x 15 = 30 damage against 25 HP, and both uses are spent at once.
    expect(next.seats[0]?.attached.some(id => next.cards[id]?.cardId === 'ma-004')).toBe(true);
    expect(next.removed).toContain(g.id);
  });
});

describe('SK-036 Bomber LV.3 — Explosive damage dealt to all Revealed Infected', () => {
  it('exploreExplosiveDamage sums only the Explosive weapons', () => {
    const weapons = [
      { damage: 15, tags: ['explosive'] },
      { damage: 10, tags: ['gun', 'pistol'] },
    ];
    expect(exploreExplosiveDamage([], [], weapons)).toBe(15);
  });

  it('exploreExplosiveDamage includes the per-Explosive bonuses (SK-034, Jill L1)', () => {
    const effects: SkillEffect[] = [{ kind: 'exploreExplosivePlusDamage', amount: 5 }];
    const abilities: CharacterAbility[] = [{ kind: 'explosivesPlusDamage', amount: 5, level: 1 }];
    const weapons = [
      { damage: 15, tags: ['explosive'] },
      { damage: 100, tags: ['explosive'] },
    ];
    // (15 + 100) + 2 explosives x (5 from SK-034 + 5 from Jill L1)
    expect(exploreExplosiveDamage(effects, abilities, weapons)).toBe(135);
  });

  it('exploreExplosiveDamage is 0 with no Explosive weapon', () => {
    expect(exploreExplosiveDamage([], [], [{ damage: 10, tags: ['gun'] }])).toBe(0);
  });

  it('resolveMultiExplore keeps the pooled all-or-nothing rule without the Skill', () => {
    const r = resolveMultiExplore({
      damage: 25,
      revealed: [
        { cardId: 'ma-003', hp: 15, attack: 10 },
        { cardId: 'ma-004', hp: 25, attack: 20 },
      ],
    });
    expect(r.defeated).toBe(false); // 25 < 40 combined
    expect(r.splashDefeated).toEqual([false, false]);
    expect(r.survivingAttack).toBe(30);
  });

  it('resolveMultiExplore splashes the Explosive damage onto each revealed Infected', () => {
    const r = resolveMultiExplore({
      damage: 25,
      explosiveDamage: 15,
      revealed: [
        { cardId: 'ma-003', hp: 15, attack: 10 },
        { cardId: 'ma-004', hp: 25, attack: 20 },
      ],
    });
    expect(r.defeated).toBe(false);
    expect(r.splashDefeated).toEqual([true, false]);
    expect(r.survivingAttack).toBe(20);
  });

  it('resolveMultiExplore reports everything defeated when the pooled hit lands', () => {
    const r = resolveMultiExplore({
      damage: 45,
      explosiveDamage: 15,
      revealed: [
        { cardId: 'ma-003', hp: 15, attack: 10 },
        { cardId: 'ma-004', hp: 25, attack: 20 },
      ],
    });
    expect(r.defeated).toBe(true);
    expect(r.splashDefeated).toEqual([true, true]);
    expect(r.survivingAttack).toBe(0);
  });

  it('flows through the explore reducer: the weak revealed Infected dies, the strong one survives', () => {
    let s = baseGame({ exploresLeft: 3, turnAmmo: 50 });
    s = injectSkill(s, 0, 'sk-036', 7);
    const g = addCard(s, 0, 'we-001'); // Grenade 15, Explosive
    const h = addCard(g.state, 0, 'we-009'); // Handgun 10
    s = setMansionTop(h.state, 'ma-004'); // Zombie Butcher, 25 HP
    s = setMansionTop(s, 'ma-003'); // Zombie (Female), 15 HP — revealed first
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id, h.id], exploreCount: 2 });
    const attached = (next.seats[0]?.attached ?? []).map(id => next.cards[id]?.cardId);
    expect(attached).toContain('ma-003');
    expect(attached).not.toContain('ma-004');
    // The survivor goes to the bottom of the Mansion.
    expect(next.mansionDeck.some(id => next.cards[id]?.cardId === 'ma-004')).toBe(true);
    // Only the survivor's attack is taken (Zombie Butcher 20), not the combined 30.
    expect(next.seats[0]?.hp).toBe(80);
  });

  it('is inert without the Skill (both revealed Infected survive)', () => {
    let s = baseGame({ exploresLeft: 3, turnAmmo: 50 });
    const g = addCard(s, 0, 'we-001');
    const h = addCard(g.state, 0, 'we-009');
    s = setMansionTop(h.state, 'ma-004');
    s = setMansionTop(s, 'ma-003');
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id, h.id], exploreCount: 2 });
    expect(next.seats[0]?.attached ?? []).toEqual([]);
    expect(next.seats[0]?.hp).toBe(70); // combined attack 10 + 20
  });

  it('is inert while the Skill is below its XP requirement', () => {
    let s = baseGame({ exploresLeft: 3, turnAmmo: 50 });
    s = injectSkill(s, 0, 'sk-036', 6);
    const g = addCard(s, 0, 'we-001');
    const h = addCard(g.state, 0, 'we-009');
    s = setMansionTop(h.state, 'ma-004');
    s = setMansionTop(s, 'ma-003');
    const next = applyAction(s, { type: 'explore', seat: 0, weapons: [g.id, h.id], exploreCount: 2 });
    expect(next.seats[0]?.attached ?? []).toEqual([]);
    expect(next.seats[0]?.hp).toBe(70);
  });
});
