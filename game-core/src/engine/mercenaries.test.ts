import { describe, expect, it } from 'vitest';
import type { CardDef, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { exploreDamage } from './explore';
import { enumerateLegalActions } from '../ai/enumerate';
import { MERCENARIES_CARDS } from '../data/mercenaries';
import { MERCENARIES_PILES, MERCENARIES_MANSION } from '../data/cards';

/**
 * Mercenaries expansion — engine behaviour for the 52 data-only cards
 * (8 characters, 8 weapons, 10 actions, 26 infected).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(cardId: string): string {
  idCounter += 1;
  return `${cardId}#t${idCounter}`;
}

const MERC_CHARS = ['ch-044', 'ch-045', 'ch-046', 'ch-047', 'ch-048', 'ch-049', 'ch-050', 'ch-051'];

function mercGame(characterCardId: string, over: Partial<PlayerState> = {}): GameState {
  const seat1 = MERC_CHARS.find(c => c !== characterCardId) ?? 'ch-044';
  const s = setup(
    {
      seed: 5,
      players: [
        { name: 'Hero', controller: 'human', characterCardId },
        { name: 'Foe', controller: 'human', characterCardId: seat1 },
      ],
    },
    MERCENARIES_CARDS,
    MERCENARIES_PILES,
    MERCENARIES_MANSION,
  );
  return tune(s, { level: 1, decorations: 10, ...over });
}

function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

/** Add a card instance to a seat's zone (registered in `cards`). */
function addCard(s: GameState, seat: number, cardId: string, zone: 'hand' | 'discard' | 'inventory' | 'playArea' = 'hand'): GameState {
  const id = nextId(cardId);
  const zoneValue = zone;
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: zoneValue, index: 0, seat } } },
    seats: s.seats.map((p, i) => {
      if (i !== seat) return p;
      if (zone === 'hand') return { ...p, hand: [...p.hand, id] };
      if (zone === 'discard') return { ...p, discard: [...p.discard, id] };
      if (zone === 'playArea') return { ...p, playArea: [...p.playArea, id] };
      return { ...p, inventory: [id, ...p.inventory] };
    }),
  };
}

/** Put a card on top of the Mansion deck. */
function mansionTop(s: GameState, cardId: string): GameState {
  const id = nextId(cardId);
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'mansionDeck', index: 0 } } },
    mansionDeck: [id, ...s.mansionDeck],
  };
}

/** Put a card on top of a market pile. */
function pileTop(s: GameState, pileId: string, cardId: string): GameState {
  const id = nextId(cardId);
  const pile = s.marketPiles[pileId];
  if (pile === undefined) return s;
  return {
    ...s,
    cards: { ...s.cards, [id]: { instanceId: id, cardId, location: { zone: 'marketPile', index: 0, pileId } } },
    marketPiles: { ...s.marketPiles, [pileId]: { ...pile, cards: [id, ...pile.cards] } },
  };
}

function findHand(s: GameState, cardId: string, seat = 0): string {
  const p = s.seats[seat];
  const id = (p?.hand ?? []).find(hid => s.cards[hid]?.cardId === cardId);
  if (id === undefined) throw new Error(`card ${cardId} not in hand of seat ${seat}`);
  return id;
}

function findPrompt(s: GameState, kind: string): string {
  const p = s.prompts.find(x => x.payload?.kind === kind);
  if (p === undefined) throw new Error(`prompt ${kind} not found (have: ${s.prompts.map(x => x.payload?.kind).join(',')})`);
  return p.id;
}

function choose(s: GameState, seat: number, promptId: string, option: number): GameState {
  return applyAction(s, { type: 'chooseOption', seat, promptId, option });
}

/** Explore with a single weapon from hand, ensuring enough ammo. */
function explore(s: GameState, seat: number, weaponId: string): GameState {
  return applyAction(tune(s, { turnAmmo: 200 }), { type: 'explore', seat, weapons: [weaponId], exploreCount: 1 });
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

describe('Mercenaries characters', () => {
  it('CH-044 Krauser: +10 damage at turn start when tied for lowest Decorations', () => {
    const s = mercGame('ch-044');
    const lowest = startTurn(tune(s, { decorations: 0 }));
    expect(lowest.seats[0]?.weaponDamageBonusThisTurn).toBe(10);
    const notLowest = startTurn(tune(s, { decorations: 5 }));
    expect(notLowest.seats[0]?.weaponDamageBonusThisTurn).toBe(0);
  });

  it('CH-045 HUNK: -20 damage and gains 1 Ammo x10 when he takes damage', () => {
    const s = mercGame('ch-045');
    const withInfected = mansionTop(s, 'ma-078'); // attack 60
    const weapon = findHand(withInfected, 'we-050');
    const next = explore(withInfected, 0, weapon);
    expect(next.seats[0]?.hp).toBe(90 - 40); // HUNK's max HP is 90
    expect(next.seats[0]?.discard.some(id => next.cards[id]?.cardId === 'am-005')).toBe(true);
  });

  it('CH-046 Claire: -1 Buy for -10 Ammo Requirement this turn', () => {
    const s = mercGame('ch-046');
    const next = startTurn(s);
    const promptId = findPrompt(next, 'claireBuyForAmmo');
    const yes = choose(next, 0, promptId, 0);
    expect(yes.seats[0]?.buysLeft).toBe(0);
    expect(yes.seats[0]?.allWeaponsAmmoDiscountThisTurn).toBe(10);
    const no = choose(next, 0, promptId, 1);
    expect(no.seats[0]?.buysLeft).toBe(1);
    expect(no.seats[0]?.allWeaponsAmmoDiscountThisTurn).toBeUndefined();
  });

  it('CH-047 Chris: on defeat, may trash a card from discard or hand', () => {
    const s = mercGame('ch-047');
    const withInfected = mansionTop(s, 'ma-073'); // hp 10
    const weapon = findHand(withInfected, 'we-049');
    const next = explore(withInfected, 0, weapon);
    const promptId = findPrompt(next, 'chrisTrashDiscardOrHand');
    const trashed = choose(next, 0, promptId, 0);
    const removedId = next.prompts.find(p => p.id === promptId)?.options[0];
    expect(removedId).toBeDefined();
    expect(trashed.removed).toContain(removedId);
  });

  it('CH-048 Jill: choose a player; their weapons cost +10 Ammo next turn', () => {
    const s = mercGame('ch-048');
    const next = applyAction(tune(s, { level: 1 }), { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const promptId = findPrompt(next, 'jillAmmoIncrease');
    const chosen = choose(next, 0, promptId, 0);
    expect(chosen.seats[1]?.ammoReqIncreaseNextTurn).toBe(10);
    const seat1Turn = startTurn({ ...chosen, activeSeat: 1 });
    expect(seat1Turn.seats[1]?.ammoReqIncreaseThisTurn).toBe(10);
    expect(seat1Turn.seats[1]?.ammoReqIncreaseNextTurn).toBeUndefined();
  });

  it('CH-049 Wesker: explore damage reduced by 10 per card in hand', () => {
    const s = mercGame('ch-049');
    const withInfected = mansionTop(s, 'ma-078'); // attack 60
    const extra1 = addCard(withInfected, 0, 'am-005');
    const weapon = findHand(extra1, 'we-050');
    const next = explore(extra1, 0, weapon);
    // hand after the weapon leaves = 5 cards -> -50; 60 - 50 = 10
    expect(next.seats[0]?.hp).toBe(100);
  });

  it('CH-050 Rebecca: on buy, may move the bought card to another player\'s discard', () => {
    const s = mercGame('ch-050');
    const tuned = tune(s, { turnGold: 100 });
    const next = applyAction(tuned, { type: 'buy', seat: 0, pileId: 'am10' });
    const promptId = findPrompt(next, 'rebeccaBuyRedirect');
    const boughtId = (next.prompts.find(p => p.id === promptId)?.payload?.instanceId) as string;
    const redirected = choose(next, 0, promptId, 0);
    expect(redirected.seats[0]?.discard).not.toContain(boughtId);
    expect(redirected.seats[1]?.discard).toContain(boughtId);
  });

  it('CH-051 Barry: chain-defeats lower-HP infected from the Mansion top', () => {
    const s = mercGame('ch-051');
    // Top: ma-073 (hp 10), then ma-077 (hp 5) — the chain must defeat both.
    const withTop = mansionTop(mansionTop(s, 'ma-077'), 'ma-073');
    const weapon = findHand(withTop, 'we-049');
    const next = explore(withTop, 0, weapon);
    expect(next.seats[0]?.attached.length).toBe(2);
    expect(next.seats[0]?.decorations).toBe(10 + 1 + 3);
  });
});

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

describe('Mercenaries weapons', () => {
  it('WE-043 Ibex Standard: pay 20 Ammo for +10 Damage', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-043');
    const tuned = tune(withWeapon, { turnAmmo: 30 });
    const weapon = findHand(tuned, 'we-043');
    const next = applyAction(tuned, { type: 'useWeaponAbility', seat: 0, instanceId: weapon });
    expect(next.seats[0]?.turnAmmo).toBe(10);
    expect(next.seats[0]?.weaponDamageBonusById?.[weapon]).toBe(10);
    expect(validateAction(next, { type: 'useWeaponAbility', seat: 0, instanceId: weapon }).ok).toBe(false);
  });

  it('WE-045 Custom Full-Bore Machine Gun: +1 XP on defeat', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-045');
    const withInfected = mansionTop(withWeapon, 'ma-073'); // hp 10
    const weapon = findHand(withInfected, 'we-045');
    const next = explore(withInfected, 0, weapon);
    expect(next.seats[0]?.xp).toBe(2); // +1 explore, +1 weapon
  });

  it('WE-046 Custom Lightning Hawk: remove XP for +10 Damage per XP', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-046');
    const tuned = tune(withWeapon, { xp: 3 });
    const weapon = findHand(tuned, 'we-046');
    const next = applyAction(tuned, { type: 'useWeaponAbility', seat: 0, instanceId: weapon });
    const promptId = findPrompt(next, 'we046ChooseAmount');
    const resolved = choose(next, 0, promptId, 2); // remove 3 XP
    expect(resolved.seats[0]?.xp).toBe(0);
    expect(resolved.seats[0]?.weaponDamageBonusById?.[weapon]).toBe(30);
  });

  it('WE-047 Custom Bolt-Action Rifle: +10 Damage with 3+ XP', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-047');
    const tuned = tune(withWeapon, { xp: 3 });
    const weapon = findHand(tuned, 'we-047');
    expect(exploreDamage(tuned, 0, [weapon])).toBe(50);
    const lowXp = tune(withWeapon, { xp: 2 });
    expect(exploreDamage(lowXp, 0, [weapon])).toBe(40);
  });

  it('WE-048 Hunting Bow: +10 Damage with no Actions in the Play Area; blocks Actions', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-048');
    const tuned = tune(withWeapon, {});
    const weapon = findHand(tuned, 'we-048');
    expect(exploreDamage(tuned, 0, [weapon])).toBe(30);
    // With an Action in the play area, no bonus.
    const withAction = addCard(tuned, 0, 'ac-046', 'playArea');
    expect(exploreDamage(withAction, 0, [weapon])).toBe(20);
    // While the bow is in the play area, playing Actions is rejected.
    const bowInPlay = {
      ...tuned,
      seats: tuned.seats.map((p, i) => (i === 0
        ? { ...p, playArea: [weapon], hand: p.hand.filter(id => id !== weapon) }
        : p)),
    };
    const withActionCard = addCard(bowInPlay, 0, 'ac-046');
    const actionId = withActionCard.seats[0]?.hand.find(id => withActionCard.cards[id]?.cardId === 'ac-046');
    expect(actionId).toBeDefined();
    expect(validateAction(withActionCard, { type: 'playActionCard', seat: 0, instanceId: actionId as string }).ok).toBe(false);
  });

  it('WE-049 Custom Standard Sidearm: +10 Damage, Trashed at end of turn', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-049');
    const tuned = tune(withWeapon, {});
    const weapon = findHand(tuned, 'we-049');
    const next = applyAction(tuned, { type: 'useWeaponAbility', seat: 0, instanceId: weapon });
    expect(next.seats[0]?.weaponDamageBonusById?.[weapon]).toBe(10);
    expect(next.seats[0]?.trashAtEndOfTurn).toContain(weapon);
    const ended = applyAction(next, { type: 'endTurn', seat: 0 });
    expect(ended.removed).toContain(weapon);
  });

  it('WE-050 Reliable Blade: on defeat, optional +10 Gold and Trash at end of turn', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-050');
    const withInfected = mansionTop(withWeapon, 'ma-073'); // hp 10
    const weapon = findHand(withInfected, 'we-050');
    const tuned = tune(withInfected, { turnGold: 0, weaponDamageBonusThisTurn: 5 }); // 5 + 5 = 10 damage
    const next = explore(tuned, 0, weapon);
    const promptId = findPrompt(next, 'we050Choose');
    const yes = choose(next, 0, promptId, 0);
    expect(yes.seats[0]?.turnGold).toBe(10);
    expect(yes.seats[0]?.trashAtEndOfTurn).toContain(weapon);
  });
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe('Mercenaries actions', () => {
  it('AC-042 Fight or Flight: reactive trash moves a stronger Infected to the bottom', () => {
    const s = mercGame('ch-044');
    const withCard0 = addCard(s, 1, 'ac-042'); // seat 1 holds it
    const withInfected = mansionTop(withCard0, 'ma-078'); // hp 80 > hero hp 50
    const weapon = findHand(withInfected, 'we-050');
    const tuned = tune(withInfected, { hp: 50 });
    const next = explore(tuned, 0, weapon);
    const promptId = findPrompt(next, 'fightOrFlight');
    const resolved = choose(next, 1, promptId, 0); // trash it
    // The explore is cancelled: no damage, the Infected goes to the bottom.
    expect(resolved.seats[0]?.hp).toBe(50);
    expect(resolved.mansionDeck.some(id => resolved.cards[id]?.cardId === 'ma-078')).toBe(true);
    expect(resolved.removed.some(id => resolved.cards[id]?.cardId === 'ac-042')).toBe(true);
  });

  it('AC-043 The Mercenaries: discard a weapon from another player\'s hand for +X damage', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-043');
    const withVictimWeapon = addCard(withAction, 1, 'we-044'); // damage 30
    const tuned = tune(withVictimWeapon, { actionsLeft: 1, weaponDamageBonusThisTurn: 0 });
    const action = findHand(tuned, 'ac-043');
    let next = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: action });
    const p1 = findPrompt(next, 'ac043ChoosePlayer');
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ac043ChooseWeapon');
    const weaponPrompt = next.prompts.find(p => p.payload?.kind === 'ac043ChooseWeapon');
    const victimWeapon = weaponPrompt?.options.find(id => next.cards[id]?.cardId === 'we-044');
    const victimIndex = weaponPrompt?.options.indexOf(victimWeapon as string) ?? 0;
    next = choose(next, 0, p2, victimIndex);
    expect(next.seats[0]?.weaponDamageBonusThisTurn).toBe(30);
    expect(next.seats[1]?.hand).not.toContain(victimWeapon);
    expect(next.seats[1]?.discard).toContain(victimWeapon);
  });

  it('AC-044 Boundless Battlefield: discard 2 then trash 1', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-044');
    const withCards = addCard(addCard(withAction, 0, 'am-005'), 0, 'am-005');
    const tuned = tune(withCards, { actionsLeft: 1 });
    const action = findHand(tuned, 'ac-044');
    let next = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: action });
    const p1 = findPrompt(next, 'ac044Discard');
    const first = next.prompts.find(p => p.payload?.kind === 'ac044Discard')?.options[0];
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ac044Discard');
    next = choose(next, 0, p2, 0);
    const p3 = findPrompt(next, 'ac044Trash');
    const third = next.prompts.find(p => p.payload?.kind === 'ac044Trash')?.options[0];
    next = choose(next, 0, p3, 0);
    expect(next.seats[0]?.hand).not.toContain(first);
    expect(next.seats[0]?.hand).not.toContain(third);
    expect(next.removed).toContain(third);
  });

  it('AC-045 Coup de Grâce: +10 per 5 XP, max +20', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-045');
    const withWeapon = addCard(withAction, 0, 'we-049');
    const tuned = tune(withWeapon, { actionsLeft: 1, xp: 12 });
    const action = findHand(tuned, 'ac-045');
    let next = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: action });
    const p1 = findPrompt(next, 'ac045ChooseWeapon');
    const weapon = next.prompts.find(p => p.payload?.kind === 'ac045ChooseWeapon')?.options[0];
    next = choose(next, 0, p1, 0);
    expect(next.seats[0]?.pendingCoupDeGrace?.amount).toBe(20);
    expect(exploreDamage(next, 0, [weapon as string])).toBe(10 + 20);
  });

  it('AC-046 Melee: +10 Damage this turn', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-046');
    const tuned = tune(withAction, { actionsLeft: 1 });
    const action = findHand(tuned, 'ac-046');
    const next = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: action });
    expect(next.seats[0]?.weaponDamageBonusThisTurn).toBe(10);
  });

  it('AC-047 Anticipation: trash 2 same-type cards for +20 Gold', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-047');
    const withCards = addCard(addCard(withAction, 0, 'am-005'), 0, 'am-005');
    const tuned = tune(withCards, { actionsLeft: 1, turnGold: 0 });
    const action = findHand(tuned, 'ac-047');
    let next = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: action });
    const p1 = findPrompt(next, 'ac047ChooseFirst');
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ac047ChooseSecond');
    next = choose(next, 0, p2, 0);
    expect(next.seats[0]?.turnGold).toBe(20);
  });

  it('AC-048 Backstab: on explore, the target moves 1 XP and discards', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-048');
    const tuned = tune(withAction, { actionsLeft: 1 });
    const action = findHand(tuned, 'ac-048');
    let next = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: action });
    const p1 = findPrompt(next, 'ac048ChoosePlayer');
    next = choose(next, 0, p1, 0);
    expect(next.seats[0]?.pendingBackstab?.targetSeat).toBe(1);
    // Give seat 1 a Skill with XP.
    const skillId = 'sk-011#1';
    const withSkill: GameState = {
      ...next,
      cards: { ...next.cards, [skillId]: { instanceId: skillId, cardId: 'sk-011', xp: 2, location: { zone: 'skillArea', index: 0, seat: 1 } } },
      seats: next.seats.map((p, i) => (i === 1 ? { ...p, skills: [skillId] } : p)),
    };
    const weapon = findHand(withSkill, 'we-050');
    next = explore(withSkill, 0, weapon);
    const p2 = findPrompt(next, 'backstabChooseSkill');
    next = choose(next, 1, p2, 0);
    expect(next.seats[0]?.xp).toBe(2); // +1 explore, +1 from the target's Skill
    expect((next.cards[skillId]?.xp ?? 0)).toBe(1);
    const p3 = findPrompt(next, 'backstabDiscard');
    next = choose(next, 1, p3, 0);
    expect(next.seats[1]?.hand.length).toBe(4);
  });

  it('AC-049 Battle Hardened: hand to inventory bottom, draw same, optional XP for a card', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-049');
    const tuned = tune(withAction, { actionsLeft: 1, xp: 1 });
    const action = findHand(tuned, 'ac-049');
    let next = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: action });
    const p1 = findPrompt(next, 'ac049Move');
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ac049Move');
    const doneIndex = next.prompts.find(p => p.payload?.kind === 'ac049Move')?.options.indexOf('DONE') ?? 0;
    next = choose(next, 0, p2, doneIndex); // DONE
    // The moved card went to the inventory bottom and was redrawn (hand size
    // is unchanged by the move+draw pair).
    expect(next.seats[0]?.hand.length).toBe(5);
    const p3 = findPrompt(next, 'ac049RemoveXp');
    next = choose(next, 0, p3, 0); // Yes
    expect(next.seats[0]?.xp).toBe(0);
    expect(next.seats[0]?.hand.length).toBe(6);
  });

  it('AC-050 Resuscitate: trash to set a lethal-hit Character to 10 HP', () => {
    const s = mercGame('ch-044');
    const withCard0 = addCard(s, 0, 'ac-050');
    const withInfected = mansionTop(withCard0, 'ma-078'); // attack 60
    const tuned = tune(withInfected, { hp: 50 });
    const weapon = findHand(tuned, 'we-050');
    const next = explore(tuned, 0, weapon);
    const promptId = findPrompt(next, 'resuscitate');
    const saved = choose(next, 0, promptId, 0); // trash the Resuscitate
    expect(saved.seats[0]?.hp).toBe(10);
    expect(saved.removed.some(id => saved.cards[id]?.cardId === 'ac-050')).toBe(true);
  });

  it('AC-051 Tear Gas: discard inventory until a Weapon, +10 Damage per card', () => {
    const s = mercGame('ch-044');
    const withAction = addCard(s, 0, 'ac-051');
    const ammo1 = nextId('am-005');
    const ammo2 = nextId('am-005');
    const knife = nextId('we-050');
    const tuned = tune(withAction, {
      actionsLeft: 1,
      inventory: [ammo1, ammo2, knife],
    });
    const withInv: GameState = {
      ...tuned,
      cards: {
        ...tuned.cards,
        [ammo1]: { instanceId: ammo1, cardId: 'am-005', location: { zone: 'inventory', index: 0, seat: 0 } },
        [ammo2]: { instanceId: ammo2, cardId: 'am-005', location: { zone: 'inventory', index: 1, seat: 0 } },
        [knife]: { instanceId: knife, cardId: 'we-050', location: { zone: 'inventory', index: 2, seat: 0 } },
      },
    };
    const action = findHand(withInv, 'ac-051');
    const next = applyAction(withInv, { type: 'playActionCard', seat: 0, instanceId: action });
    expect(next.seats[0]?.inventory).toEqual([]);
    expect(next.seats[0]?.discard).toEqual(expect.arrayContaining([ammo1, ammo2, knife]));
    expect(next.seats[0]?.weaponDamageBonusThisTurn).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Infected
// ---------------------------------------------------------------------------

describe('Mercenaries infected', () => {
  it('MA-073 Town Majini: on defeat, another player gains 1 Ammo x10', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-073');
    const weapon = findHand(withInfected, 'we-049');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma073ChoosePlayer');
    next = choose(next, 0, p1, 0);
    expect(next.seats[1]?.discard.some(id => next.cards[id]?.cardId === 'am-005')).toBe(true);
  });

  it('MA-074 Town Majini (Shovel): on defeat, a player trashes a hand card for Ammo x10', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-047'); // damage 40
    const withInfected = mansionTop(withWeapon, 'ma-074'); // hp 20
    const weapon = findHand(withInfected, 'we-047');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma074ChoosePlayer');
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ma074ChooseHandCard');
    const card = next.prompts.find(p => p.payload?.kind === 'ma074ChooseHandCard')?.options[0];
    next = choose(next, 0, p2, 0);
    expect(next.removed).toContain(card);
    expect(next.seats[1]?.hand.some(id => next.cards[id]?.cardId === 'am-005')).toBe(true);
  });

  it('MA-075 Giant Majini: not defeated with < 18 piles reduces all max HP', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-075'); // hp 50, attack 30
    const weapon = findHand(withInfected, 'we-050'); // damage 5
    // Empty most piles so the "18 piles" condition fails.
    const empties = Object.fromEntries(
      Object.entries(withInfected.marketPiles).filter(([id]) => id !== 'am10').map(([id]) => [id, { ...withInfected.marketPiles[id]!, cards: [] }]),
    );
    const thinned = { ...withInfected, marketPiles: { ...withInfected.marketPiles, ...empties } };
    const next = explore(thinned, 0, weapon);
    expect(next.seats[0]?.maxHp).toBe(80);
    expect(next.seats[1]?.maxHp).toBe(70);
  });

  it('MA-076 Base Majini (Gun): on reveal, each player removes 1 XP on a Skill', () => {
    const s = mercGame('ch-044');
    const skillId = 'sk-011#1';
    const withSkill: GameState = {
      ...s,
      cards: { ...s.cards, [skillId]: { instanceId: skillId, cardId: 'sk-011', xp: 2, location: { zone: 'skillArea', index: 0, seat: 0 } } },
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, skills: [skillId] } : p)),
    };
    const withInfected = mansionTop(withSkill, 'ma-076');
    const weapon = findHand(withInfected, 'we-050');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma076RemoveSkillXp');
    next = choose(next, 0, p1, 0);
    expect(next.cards[skillId]?.xp).toBe(1);
  });

  it('MA-077 Chicken: worth 0 Decorations while in a Combo Pile by itself', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-077'); // hp 5
    const weapon = findHand(withInfected, 'we-050'); // damage 5
    const next = explore(withInfected, 0, weapon);
    // The starting Reliable Blade triggers its on-defeat prompt; decline it.
    const bladePrompt = findPrompt(next, 'we050Choose');
    const afterBlade = choose(next, 0, bladePrompt, 1);
    expect(afterBlade.seats[0]?.attached.length).toBe(1);
    expect(afterBlade.seats[0]?.decorations).toBe(10); // lone MA-077 adds 0
    // Attaching a second Infected restores MA-077's 3 Decorations.
    const withSecond = mansionTop(tune(afterBlade, { exploresLeft: 2 }), 'ma-073'); // hp 10
    const weapon2 = findHand(withSecond, 'we-049'); // damage 10
    const after = explore(withSecond, 0, weapon2);
    expect(after.seats[0]?.decorations).toBe(10 + 3 + 1);
  });

  it('MA-078 Red Executioner: not defeated moves the highest-decoration attached to the bottom and shuffles back', () => {
    const s = mercGame('ch-044');
    const trophyId = nextId('ma-073');
    const withTrophy: GameState = {
      ...s,
      cards: { ...s.cards, [trophyId]: { instanceId: trophyId, cardId: 'ma-073', location: { zone: 'attached', index: 0, seat: 0 } } },
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: [trophyId] } : p)),
    };
    const withInfected = mansionTop(withTrophy, 'ma-078'); // hp 80
    const weapon = findHand(withInfected, 'we-050');
    const next = explore(withInfected, 0, weapon);
    expect(next.seats[0]?.attached).not.toContain(trophyId);
    expect(next.mansionDeck).toContain(trophyId);
    expect(next.seats[0]?.decorations).toBe(10 - 1); // the moved Infected's reward is lost
    expect(next.mansionDeck.some(id => next.cards[id]?.cardId === 'ma-078')).toBe(true);
  });

  it('MA-079 Big Man Majini: not defeated, the exploring player gains 2 Ammo x10', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-079'); // hp 40
    const weapon = findHand(withInfected, 'we-050');
    const next = explore(withInfected, 0, weapon);
    const ammo = next.seats[0]?.discard.filter(id => next.cards[id]?.cardId === 'am-005') ?? [];
    expect(ammo.length).toBeGreaterThanOrEqual(2);
  });

  it('MA-080 Chainsaw Majini: lowest-decoration players may move discard to the highest', () => {
    const s = mercGame('ch-044');
    const discardCard = nextId('am-005');
    const tuned = tune(s, { decorations: 0, discard: [discardCard] });
    const withDiscard: GameState = {
      ...tuned,
      cards: { ...tuned.cards, [discardCard]: { instanceId: discardCard, cardId: 'am-005', location: { zone: 'discard', index: 0, seat: 0 } } },
      seats: tuned.seats.map((p, i) => (i === 1 ? { ...p, decorations: 10 } : p)),
    };
    const withInfected = mansionTop(withDiscard, 'ma-080');
    const weapon = findHand(withInfected, 'we-050');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma080ChooseCard');
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ma080ChooseTarget');
    next = choose(next, 0, p2, 0);
    expect(next.seats[0]?.discard).not.toContain(discardCard);
    expect(next.seats[1]?.discard).toContain(discardCard);
  });

  it('MA-081 Los Illuminados (Shield): zeroes the lowest-Ammo-Req weapon used', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-081'); // hp 30
    const weapon = findHand(withInfected, 'we-049'); // ammoReq 20
    const knife = findHand(withInfected, 'we-050'); // ammoReq 0
    const next = applyAction(tune(withInfected, { turnAmmo: 200 }), { type: 'explore', seat: 0, weapons: [weapon, knife], exploreCount: 1 });
    // The knife (lowest ammo req) deals 0; the sidearm deals 10 -> not defeated.
    expect(next.seats[0]?.hp).toBe(100 - 10);
  });

  it('MA-082 J.J.: not defeated trashes the top 2 inventory cards', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-082'); // hp 50
    const weapon = findHand(withInfected, 'we-050');
    const next = explore(withInfected, 0, weapon);
    expect(next.seats[0]?.inventory.length).toBe(3);
  });

  it('MA-083 Los Ganados (Male): +10 Health per same-name attached', () => {
    const s = mercGame('ch-044');
    const attachedId = nextId('ma-083');
    const withAttached: GameState = {
      ...s,
      cards: { ...s.cards, [attachedId]: { instanceId: attachedId, cardId: 'ma-083', location: { zone: 'attached', index: 0, seat: 0 } } },
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: [attachedId] } : p)),
    };
    const withInfected = mansionTop(withAttached, 'ma-083'); // hp 10 + 10 = 20
    const weapon = findHand(withInfected, 'we-049'); // damage 10
    const next = explore(withInfected, 0, weapon);
    // 10 damage < 20 hp -> not defeated, takes 15 attack
    expect(next.seats[0]?.hp).toBe(85);
  });

  it('MA-084 Los Ganados (Female): +5 Health per Infected attached to the explorer', () => {
    const s = mercGame('ch-044');
    const attachedId = nextId('ma-073');
    const withAttached: GameState = {
      ...s,
      cards: { ...s.cards, [attachedId]: { instanceId: attachedId, cardId: 'ma-073', location: { zone: 'attached', index: 0, seat: 0 } } },
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, attached: [attachedId] } : p)),
    };
    const withInfected = mansionTop(withAttached, 'ma-084'); // hp 10 + 5 = 15
    const weapon = findHand(withInfected, 'we-049'); // damage 10
    const next = explore(withInfected, 0, weapon);
    expect(next.seats[0]?.hp).toBe(90);
  });

  it('MA-085 Adjule: -10 Damage when the explorer has 3+ XP', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-085'); // hp 25, attack 20
    const weapon = findHand(withInfected, 'we-050'); // damage 5
    const tuned = tune(withInfected, { xp: 3 });
    const next = explore(tuned, 0, weapon);
    expect(next.seats[0]?.hp).toBe(100 - 10);
  });

  it('MA-086 Los Illuminados (Scythe): each player passes a hand card left', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-086');
    const weapon = findHand(withInfected, 'we-050');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma086PassCard');
    const passed = next.prompts.find(p => p.payload?.kind === 'ma086PassCard')?.options[0];
    next = choose(next, 0, p1, 0);
    expect(next.seats[0]?.hand).not.toContain(passed);
    expect(next.seats[1]?.hand).toContain(passed);
  });

  it('MA-088 Tribal Majini (Bow): on defeat, move a resource card to an opponent\'s discard', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-047'); // damage 40
    const withInfected = mansionTop(withWeapon, 'ma-088'); // hp 15
    const weapon = findHand(withInfected, 'we-047');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma088ChooseCard');
    const card = next.prompts.find(p => p.payload?.kind === 'ma088ChooseCard')?.options[0];
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ma088ChooseTarget');
    next = choose(next, 0, p2, 0);
    expect(next.seats[1]?.discard).toContain(card);
  });

  it('MA-089 Tribal Majini (Oil Pot): on reveal, each player removes a resource pile top', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-089');
    const weapon = findHand(withInfected, 'we-050');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma089RemovePileTop');
    next = choose(next, 0, p1, 0);
    expect(next.removed.length).toBeGreaterThan(0);
  });

  it('MA-090 Tribal Majini (Shield): not defeated trashes a used weapon costing 40 or less', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-049'); // cost 20
    const withInfected = mansionTop(withWeapon, 'ma-090'); // hp 25
    const weapon = findHand(withInfected, 'we-049');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma090ChooseWeapon');
    next = choose(next, 0, p1, 0);
    expect(next.removed).toContain(weapon);
  });

  it('MA-092 Town Majini (Motorcycle): all players gain the lowest-cost resource', () => {
    const s = mercGame('ch-044');
    const withInfected = mansionTop(s, 'ma-092');
    const weapon = findHand(withInfected, 'we-050');
    let next = explore(withInfected, 0, weapon);
    // Two piles share the lowest cost (0), so each player is prompted to choose.
    const p1 = findPrompt(next, 'ma092ChooseCard');
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ma092ChooseCard');
    next = choose(next, 1, p2, 0);
    expect(next.seats[0]?.discard.length).toBeGreaterThan(0);
    expect(next.seats[1]?.discard.length).toBeGreaterThan(0);
  });

  it('MA-093 Los Ganados (Handscythe): on defeat, draw 1 additional card at end of turn', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-047'); // damage 40
    const withInfected = mansionTop(withWeapon, 'ma-093'); // hp 20
    const weapon = findHand(withInfected, 'we-047');
    let next = explore(withInfected, 0, weapon);
    expect(next.seats[0]?.pendingEndOfTurnDraws).toBe(1);
    next = applyAction(next, { type: 'endTurn', seat: 0 });
    expect(next.seats[0]?.hand.length).toBe(6); // 5 + 1 extra draw
  });

  it('MA-094 Los Ganados (Pitchfork): on defeat, trash a card from any discard', () => {
    const s = mercGame('ch-044');
    const discardCard = nextId('am-005');
    const tuned = tune(s, { discard: [discardCard] });
    const withDiscard: GameState = {
      ...tuned,
      cards: { ...tuned.cards, [discardCard]: { instanceId: discardCard, cardId: 'am-005', location: { zone: 'discard', index: 0, seat: 0 } } },
    };
    const withInfected = mansionTop(addCard(withDiscard, 0, 'we-047'), 'ma-094'); // hp 25
    const weapon = findHand(withInfected, 'we-047');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma094ChooseCard');
    next = choose(next, 0, p1, 0);
    expect(next.removed).toContain(discardCard);
  });

  it('MA-096 Los Illuminados (Bow): on defeat, give 20 Damage to any Character', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-047'); // damage 40
    const withInfected = mansionTop(withWeapon, 'ma-096'); // hp 30
    const weapon = findHand(withInfected, 'we-047');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma096ChooseSeat');
    next = choose(next, 0, p1, 1); // seat 1
    expect(next.seats[1]?.hp).toBe(70);
  });

  it('MA-098 Base Majini (Shield): on defeat, move a hand/discard card to another player\'s discard', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-047'); // damage 40
    const withInfected = mansionTop(withWeapon, 'ma-098'); // hp 30
    const weapon = findHand(withInfected, 'we-047');
    let next = explore(withInfected, 0, weapon);
    const p1 = findPrompt(next, 'ma098ChooseCard');
    const card = next.prompts.find(p => p.payload?.kind === 'ma098ChooseCard')?.options[0];
    next = choose(next, 0, p1, 0);
    const p2 = findPrompt(next, 'ma098ChooseTarget');
    next = choose(next, 0, p2, 0);
    expect(next.seats[1]?.discard).toContain(card);
  });
});

// ---------------------------------------------------------------------------
// Integration: enumeration + legality
// ---------------------------------------------------------------------------

describe('Mercenaries enumeration', () => {
  it('manual weapon effects are enumerated for legal use', () => {
    const s = mercGame('ch-044');
    const withWeapon = addCard(s, 0, 'we-043');
    const tuned = tune(withWeapon, { turnAmmo: 30 });
    const legal = enumerateLegalActions(tuned, 0);
    expect(legal.some(a => a.type === 'useWeaponAbility')).toBe(true);
  });

  it('Jill\'s manual ability is enumerated', () => {
    const s = mercGame('ch-048');
    const tuned = tune(s, { level: 1 });
    const legal = enumerateLegalActions(tuned, 0);
    expect(legal.some(a => a.type === 'useCharacterAbility' && a.abilityIndex === 0)).toBe(true);
  });
});
