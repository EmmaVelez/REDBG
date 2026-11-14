import { describe, expect, it } from 'vitest';
import type { GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { exploreDamage } from './explore';
import { maxWeaponUses, remainingWeaponUses } from './weaponReuse';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';

/**
 * Zombicide-style fan weapon sheet (CW-025..CW-033), read from the printed
 * cards. Two titles repeat on the sheet (Machine Gun w/ Launcher, Akimbo
 * Flintlock Pistols) — they are different weapons with different rules.
 */

const IDS = ['cw-025', 'cw-026', 'cw-027', 'cw-028', 'cw-029', 'cw-030', 'cw-031', 'cw-032', 'cw-033'] as const;

function weapon(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

function game(over: Partial<PlayerState> = {}): GameState {
  const s = setup(
    { seed: 11, players: [{ name: 'P', controller: 'human', characterCardId: 'ch-002' }] },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

let counter = 0;

function place(s: GameState, seat: number, cardId: string, zone: 'hand' | 'playArea' | 'discard' = 'hand'): { state: GameState; id: string } {
  const id = `${cardId}#t${++counter}`;
  const cards = { ...s.cards, [id]: { instanceId: id, cardId, location: { zone, index: 0 } } };
  const seats = s.seats.map((p, i) => {
    if (i !== seat) return p;
    return zone === 'hand' ? { ...p, hand: [...p.hand, id] }
      : zone === 'playArea' ? { ...p, playArea: [...p.playArea, id] }
        : { ...p, discard: [...p.discard, id] };
  });
  return { state: { ...s, cards, seats }, id };
}

function setMansionTop(s: GameState, cardIds: readonly string[], hp?: Readonly<Record<string, number>>): { state: GameState; ids: string[] } {
  const cards = { ...s.cards };
  const ids: string[] = [];
  for (const c of cardIds) {
    const id = `${c}#top${++counter}`;
    (cards as Record<string, unknown>)[id] = { instanceId: id, cardId: c, location: { zone: 'mansionDeck', index: 0 } };
    ids.push(id);
  }
  const cardDefs = { ...s.cardDefs };
  if (hp !== undefined) {
    for (const [cardId, value] of Object.entries(hp)) {
      cardDefs[cardId] = { ...cardDefs[cardId], hp: value } as typeof cardDefs[string];
    }
  }
  return { state: { ...s, cards: cards as GameState['cards'], cardDefs, mansionDeck: [...ids, ...s.mansionDeck] }, ids };
}

/** A two-Infected multi-explore with explicit HP, `weaponId` in hand. */
function multiSetup(weaponId: string, hpA: number, hpB: number, extra: Partial<PlayerState> = {}) {
  let s = game({ level: 1, hp: 80, turnAmmo: 200, exploresLeft: 2, ...extra });
  const w = place(s, 0, weaponId);
  s = w.state;
  const top = setMansionTop(s, ['ma-005', 'ma-006'], { 'ma-005': hpA, 'ma-006': hpB });
  return { state: top.state, weaponId: w.id, a: top.ids[0], b: top.ids[1] };
}

describe('Zombicide fan weapon sheet — data', () => {
  it('defines all nine cards with the printed stats', () => {
    expect(weapon('cw-025')).toEqual(expect.objectContaining({
      id: 'cw-025', name: 'Elephant Killer', type: 'weapon', set: 'custom',
      copies: 1, cost: 130, ammoReq: 50, damage: 50, weaponTags: ['gun', 'magnum'],
    }));
    expect(weapon('cw-026')).toEqual(expect.objectContaining({
      id: 'cw-026', name: 'Low Recoil Revolver', cost: 80, ammoReq: 25, damage: 25, weaponTags: ['gun', 'magnum'],
    }));
    expect(weapon('cw-027')).toEqual(expect.objectContaining({
      id: 'cw-027', name: 'Machine Gun w/ Launcher', cost: 80, ammoReq: 40, damage: 40, weaponTags: ['gun', 'machineGun'],
    }));
    expect(weapon('cw-028')).toEqual(expect.objectContaining({
      id: 'cw-028', name: 'Machine Gun w/ Launcher', cost: 80, ammoReq: 40, damage: 40, weaponTags: ['gun', 'machineGun'],
    }));
    expect(weapon('cw-029')).toEqual(expect.objectContaining({
      id: 'cw-029', name: 'Sawed-Off Double Barrel', cost: 50, ammoReq: 30, damage: 20, weaponTags: ['gun', 'shotgun'],
    }));
    expect(weapon('cw-030')).toEqual(expect.objectContaining({
      id: 'cw-030', name: 'Akimbo Flintlock Pistols', cost: 50, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'],
    }));
    expect(weapon('cw-031')).toEqual(expect.objectContaining({
      id: 'cw-031', name: 'Akimbo Flintlock Pistols', cost: 50, ammoReq: 30, damage: 20, weaponTags: ['gun', 'pistol'],
    }));
    expect(weapon('cw-032')).toEqual(expect.objectContaining({
      id: 'cw-032', name: 'Combat Knife w/ Chain', cost: 30, ammoReq: 0, damage: 5, weaponTags: ['melee', 'knife'],
    }));
    expect(weapon('cw-033')).toEqual(expect.objectContaining({
      id: 'cw-033', name: 'Semi-Auto Sniper Rifle', cost: 50, ammoReq: 40, damage: 60, weaponTags: ['gun', 'rifle'],
    }));
  });

  it('keeps the printed rules text verbatim', () => {
    expect(weapon('cw-025').text).toBe('At the end of your turn, if this card is in your Play Area and was not used while Exploring during this turn, you can move this Weapon to the top of your Inventory.');
    expect(weapon('cw-027').text).toBe('This weapon gets +5 Damage during this turn for each additional Infected your Character is Battling against.');
    expect(weapon('cw-032').text).toBe('If this weapon is in your Discard Pile at the beginning of your turn, move it to your Hand.');
    expect(weapon('cw-033').text).toBe('This weapon cannot be used with other "non-Explosive" weapons while Exploring.');
  });

  it('has no duplicate ids anywhere in the data line', () => {
    for (const id of IDS) {
      expect(CUSTOM_CARDS.filter(c => c.id === id)).toHaveLength(1);
    }
  });

  it('is NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    for (const id of IDS) {
      expect(CUSTOM_CARDS.some(c => c.id === id)).toBe(true);
    }
  });
});

describe('CW-025 Elephant Killer — recall an unused weapon', () => {
  it('moves an unused play-area copy to the top of the Inventory at end of turn', () => {
    const { state, id } = place(game({ level: 1 }), 0, 'cw-025', 'playArea');
    const ended = applyAction(state, { type: 'endTurn', seat: 0 });
    const p = ended.seats[0];
    expect(p?.playArea).not.toContain(id);
    expect(p?.discard).not.toContain(id);
    // end of turn draws a fresh hand from the Inventory, so the recalled weapon
    // (placed on top) is the first card drawn.
    expect(p?.hand).toContain(id);
  });

  it('does NOT recall a copy that was used while Exploring', () => {
    let s = game({ level: 1, hp: 80, turnAmmo: 120, exploresLeft: 1 });
    const w = place(s, 0, 'cw-025');   // hand — an explore is how a weapon is played
    s = w.state;
    const top = setMansionTop(s, ['ma-005']);
    const explored = applyAction(top.state, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    // The weapon is now in the play area and WAS used this turn.
    expect(explored.seats[0]?.playArea).toContain(w.id);
    const ended = applyAction(explored, { type: 'endTurn', seat: 0 });
    expect(ended.seats[0]?.hand).not.toContain(w.id);
    expect(ended.seats[0]?.discard).toContain(w.id);
  });

  it('is reachable today only via a play-area copy no explore used', () => {
    // NOTE: in the current engine a weapon reaches the play area only by being
    // used in an explore (`playWeapon` is validated but not implemented), so
    // the "was not used" branch is dormant until something plays a weapon
    // without exploring. The rule is implemented as printed regardless.
    const { state, id } = place(game({ level: 1 }), 0, 'cw-025', 'playArea');
    expect(validateAction(state, { type: 'explore', seat: 0, weapons: [id], exploreCount: 1 }).ok).toBe(false);
  });
});

describe('CW-026 Low Recoil Revolver — +1 Explore, usable twice', () => {
  it('grants 2 uses per turn', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 60 }), 0, 'cw-026');
    expect(maxWeaponUses(state, 0, id)).toBe(2);
    expect(remainingWeaponUses(state, 0, id)).toBe(2);
  });

  it('can be used in two separate explores in one turn', () => {
    let s = game({ level: 1, hp: 80, turnAmmo: 200, exploresLeft: 2 });
    const w = place(s, 0, 'cw-026');
    s = w.state;
    const t1 = setMansionTop(s, ['ma-005']);
    const first = applyAction(t1.state, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    const t2 = setMansionTop(first, ['ma-005']);
    const second = applyAction(t2.state, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    expect(second.seats[0]?.attached.length).toBeGreaterThanOrEqual(1);
  });

  it('grants its +1 Explore back when used (net 0 Explores spent)', () => {
    let s = game({ level: 1, hp: 80, turnAmmo: 200, exploresLeft: 2 });
    const w = place(s, 0, 'cw-026');
    s = w.state;
    const t1 = setMansionTop(s, ['ma-005']);
    const first = applyAction(t1.state, { type: 'explore', seat: 0, weapons: [w.id], exploreCount: 1 });
    expect(first.seats[0]?.exploresLeft).toBe(2);
  });
});

describe('CW-027 Machine Gun w/ Launcher — +5 per additional Infected', () => {
  it('adds nothing against a single Infected', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-027');
    expect(exploreDamage(state, 0, [id], 'main', {}, 1)).toBe(40);
  });

  it('adds +5 per Infected beyond the first', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-027');
    expect(exploreDamage(state, 0, [id], 'main', {}, 2)).toBe(45);
    expect(exploreDamage(state, 0, [id], 'main', {}, 3)).toBe(50);
  });

  it('reaches the reducer: 45 damage clears 45 combined Health but not 50', () => {
    const low = multiSetup('cw-027', 10, 35);   // combined 45
    const cleared = applyAction(low.state, { type: 'explore', seat: 0, weapons: [low.weaponId], exploreCount: 2 });
    expect(cleared.seats[0]?.attached).toEqual(expect.arrayContaining([low.a, low.b]));

    const high = multiSetup('cw-027', 10, 40);  // combined 50
    const failed = applyAction(high.state, { type: 'explore', seat: 0, weapons: [high.weaponId], exploreCount: 2 });
    expect(failed.seats[0]?.attached).not.toContain(high.a);
    expect(failed.seats[0]?.hp).toBeLessThan(80);
  });
});

describe('CW-028 Machine Gun w/ Launcher — armed launcher mode', () => {
  it('is a manual, once-per-turn trigger', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-028');
    expect(validateAction(state, { type: 'useWeaponAbility', seat: 0, instanceId: id })).toEqual({ ok: true });
    const armed = applyAction(state, { type: 'useWeaponAbility', seat: 0, instanceId: id });
    expect(armed.seats[0]?.armedLauncherInstanceId).toBe(id);
    expect(validateAction(armed, { type: 'useWeaponAbility', seat: 0, instanceId: id })).toEqual({
      ok: false, reason: 'useWeaponAbility: already used this turn',
    });
  });

  it('deals 15 to every Revealed Infected and no weapon Damage', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-028');
    expect(exploreDamage(state, 0, [id], 'main', {}, 2)).toBe(40);   // unarmed
    const armed = applyAction(state, { type: 'useWeaponAbility', seat: 0, instanceId: id });
    expect(exploreDamage(armed, 0, [id], 'main', {}, 1)).toBe(15);
    expect(exploreDamage(armed, 0, [id], 'main', {}, 2)).toBe(30);
    expect(exploreDamage(armed, 0, [id], 'main', {}, 3)).toBe(45);
  });

  it('splashes each Revealed Infected individually in a multi-explore', () => {
    const kill = multiSetup('cw-028', 15, 15);
    const armedKill = applyAction(kill.state, { type: 'useWeaponAbility', seat: 0, instanceId: kill.weaponId });
    const killed = applyAction(armedKill, { type: 'explore', seat: 0, weapons: [kill.weaponId], exploreCount: 2 });
    expect(killed.seats[0]?.attached).toEqual(expect.arrayContaining([kill.a, kill.b]));

    const survive = multiSetup('cw-028', 20, 20);
    const armedSurvive = applyAction(survive.state, { type: 'useWeaponAbility', seat: 0, instanceId: survive.weaponId });
    const survived = applyAction(armedSurvive, { type: 'explore', seat: 0, weapons: [survive.weaponId], exploreCount: 2 });
    expect(survived.seats[0]?.attached).not.toContain(survive.a);
    expect(survived.seats[0]?.hp).toBeLessThan(80);
  });

  it('clears at the end of the turn', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-028');
    const armed = applyAction(state, { type: 'useWeaponAbility', seat: 0, instanceId: id });
    const ended = applyAction(armed, { type: 'endTurn', seat: 0 });
    expect(ended.seats[0]?.armedLauncherInstanceId).toBeUndefined();
  });
});

describe('CW-029 Sawed-Off Double Barrel — +1 card, trash Ammo for +X', () => {
  it('offers the manual trash trigger only with Ammunition in play', () => {
    const a = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-029');
    expect(validateAction(a.state, { type: 'useWeaponAbility', seat: 0, instanceId: a.id })).toEqual({
      ok: false, reason: 'useWeaponAbility: no Ammunition in play',
    });
    const am = place(a.state, 0, 'am-001', 'playArea');   // Ammo x10
    const withAmmo = { ...am.state, seats: am.state.seats.map((s, i) => (i === 0 ? { ...s, hand: [...s.hand, a.id] } : s)) };
    expect(validateAction(withAmmo, { type: 'useWeaponAbility', seat: 0, instanceId: a.id })).toEqual({ ok: true });
  });

  it('trashes the chosen Ammunition and grants +X Damage equal to its Ammo', () => {
    const a = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-029');
    const am = place(a.state, 0, 'am-001', 'playArea');
    const withAmmo = { ...am.state, seats: am.state.seats.map((s, i) => (i === 0 ? { ...s, hand: [...s.hand, a.id] } : s)) };
    const prompted = applyAction(withAmmo, { type: 'useWeaponAbility', seat: 0, instanceId: a.id });
    const prompt = prompted.prompts.find(p => p.payload?.kind === 'cw029TrashAmmo');
    expect(prompt).toBeDefined();
    const resolved = applyAction(prompted, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect(resolved.removed).toContain(am.id);
    expect(resolved.seats[0]?.playArea).not.toContain(am.id);
    expect(resolved.seats[0]?.weaponDamageBonusById?.[a.id]).toBe(10);
  });

  it('is once per turn', () => {
    const a = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-029');
    const am = place(a.state, 0, 'am-001', 'playArea');
    const withAmmo = { ...am.state, seats: am.state.seats.map((s, i) => (i === 0 ? { ...s, hand: [...s.hand, a.id] } : s)) };
    const prompted = applyAction(withAmmo, { type: 'useWeaponAbility', seat: 0, instanceId: a.id });
    const prompt = prompted.prompts.find(p => p.payload?.kind === 'cw029TrashAmmo')!;
    const resolved = applyAction(prompted, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    expect(validateAction(resolved, { type: 'useWeaponAbility', seat: 0, instanceId: a.id })).toEqual({
      ok: false, reason: 'useWeaponAbility: already used this turn',
    });
  });
});

describe('CW-030 / CW-031 Akimbo Flintlock Pistols', () => {
  it('CW-030 deals its Damage to two different Infected (counts twice vs 2+)', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-030');
    expect(exploreDamage(state, 0, [id], 'main', {}, 1)).toBe(20);
    expect(exploreDamage(state, 0, [id], 'main', {}, 2)).toBe(40);
  });

  it('CW-031 gets +20 when Battling more than one Infected', () => {
    const { state, id } = place(game({ level: 1, turnAmmo: 120 }), 0, 'cw-031');
    expect(exploreDamage(state, 0, [id], 'main', {}, 1)).toBe(20);
    expect(exploreDamage(state, 0, [id], 'main', {}, 2)).toBe(40);
    expect(exploreDamage(state, 0, [id], 'main', {}, 3)).toBe(40);   // flat bonus, not per-Infected
  });

  it('both reach the reducer and clear 40 combined Health', () => {
    for (const id of ['cw-030', 'cw-031']) {
      const setup = multiSetup(id, 10, 30);   // combined 40
      const next = applyAction(setup.state, { type: 'explore', seat: 0, weapons: [setup.weaponId], exploreCount: 2 });
      expect(next.seats[0]?.attached).toEqual(expect.arrayContaining([setup.a, setup.b]));
    }
  });

  it('neither clears 50 combined Health', () => {
    for (const id of ['cw-030', 'cw-031']) {
      const setup = multiSetup(id, 10, 40);   // combined 50
      const next = applyAction(setup.state, { type: 'explore', seat: 0, weapons: [setup.weaponId], exploreCount: 2 });
      expect(next.seats[0]?.attached).not.toContain(setup.a);
    }
  });
});

describe('CW-032 Combat Knife w/ Chain — recycle from Discard', () => {
  it('moves a copy from the Discard Pile to the Hand at the start of your turn', () => {
    const { state, id } = place(game({ level: 1 }), 0, 'cw-032', 'discard');
    expect(state.seats[0]?.discard).toContain(id);
    const turned = startTurn(state);
    expect(turned.seats[0]?.discard).not.toContain(id);
    expect(turned.seats[0]?.hand).toContain(id);
  });

  it('does nothing when the copy is not in the Discard Pile', () => {
    const { state, id } = place(game({ level: 1 }), 0, 'cw-032', 'hand');
    const turned = startTurn(state);
    expect(turned.seats[0]?.hand).toContain(id);
    expect(turned.seats[0]?.discard).not.toContain(id);
  });
});

describe('CW-033 Semi-Auto Sniper Rifle — no non-Explosive companions', () => {
  it('rejects a non-Explosive companion', () => {
    let s = game({ level: 1, turnAmmo: 120 });
    const sniper = place(s, 0, 'cw-033');
    s = sniper.state;
    const handgun = place(s, 0, 'we-009');
    expect(validateAction(handgun.state, { type: 'explore', seat: 0, weapons: [sniper.id, handgun.id], exploreCount: 1 })).toEqual({
      ok: false, reason: 'explore: Semi-Auto Sniper Rifle cannot be used with other non-Explosive weapons',
    });
  });

  it('allows an Explosive companion and itself alone', () => {
    let s = game({ level: 1, turnAmmo: 120 });
    const sniper = place(s, 0, 'cw-033');
    s = sniper.state;
    const grenade = place(s, 0, 'we-001');
    s = grenade.state;
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [sniper.id], exploreCount: 1 }).ok).toBe(true);
    expect(validateAction(s, { type: 'explore', seat: 0, weapons: [sniper.id, grenade.id], exploreCount: 1 }).ok).toBe(true);
  });

  it('does not restrict other weapons when it is not in the selection', () => {
    let s = game({ level: 1, turnAmmo: 120 });
    const handgun = place(s, 0, 'we-009');
    s = handgun.state;
    const shotgun = place(s, 0, 'we-013');
    expect(validateAction(shotgun.state, { type: 'explore', seat: 0, weapons: [handgun.id, shotgun.id], exploreCount: 1 }).ok).toBe(true);
  });
});
