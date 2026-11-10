import { describe, expect, it } from 'vitest';
import {
  characterAbilities,
  ammoReqForWeapon,
  requiredAmmoForWeapons,
  passiveDamageBonus,
  exploreGoldBonus,
  ammunitionCardBonus,
  explosivesGoToDiscard,
  knifeWeaponsUsedThisTurn,
  cardsOnDamageTakenDuringTurn,
  applyHpLoss,
  movesDiscardToInventoryOnDefeat,
} from './abilities';
import { exploreDamage , resolveExplore } from './explore';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { setup, startTurn as startTurnImpl } from './game';
import { PREMIER_CARDS, FIRST_TIMER_PILES } from '../data/cards';
import type { GameState, CardDef, PlayerState, CharacterAbility } from '../types';

/**
 * Batch-1 passive abilities (engine enforcement):
 * - Leon L1 pistols -10 ammoReq; Sheva L2 rifles -20 ammoReq (ammoReqForWeapon)
 * - Barry L2 magnums +20 dmg; Krauser L2 knives +5 dmg (passiveDamageBonus)
 * - Jill L1 explosives +5 dmg; Jill L2 explosives to discard not trash
 * - Chris L2 +5 dmg per Infected fought (exploreCount)
 * - Wesker L1 +20 Gold on explore
 * - Claire L1/L2 ammo cards give +10 Ammo/+10 Gold
 * Level gating: every helper reads abilitiesForLevel, so locked tiers do nothing.
 */

function def(id: string, over: Partial<CardDef> = {}): CardDef {
  return { id, name: id, type: 'weapon', set: 'premier', text: '', copies: 1, ...over } as CardDef;
}

const pistol = def('wp', { ammoReq: 20, damage: 10, weaponTags: ['gun', 'pistol'] });
const rifle = def('wr', { ammoReq: 50, damage: 20, weaponTags: ['gun', 'rifle'] });
const magnum = def('wm', { ammoReq: 50, damage: 50, weaponTags: ['gun', 'magnum'] });
const knife = def('wk', { ammoReq: 0, damage: 5, weaponTags: ['melee', 'knife'] });
const grenade = def('wg', { ammoReq: 0, damage: 15, weaponTags: ['explosive'] });
const ammoCard = def('am', { type: 'ammunition', bonuses: { ammo: 10, gold: 10 } });

const leonL1: CharacterAbility[] = [{ kind: 'ammoReqReduction', tag: 'pistol', amount: 10, level: 1 }];
const shevaL2: CharacterAbility[] = [{ kind: 'ammoReqReduction', tag: 'rifle', amount: 20, level: 2 }];
const barryL2: CharacterAbility[] = [{ kind: 'weaponTagPlusDamage', tag: 'magnum', amount: 20, level: 2 }];
const krauserL2: CharacterAbility[] = [{ kind: 'weaponTagPlusDamage', tag: 'knife', amount: 5, level: 2 }];
const jillL1: CharacterAbility[] = [{ kind: 'explosivesPlusDamage', amount: 5, level: 1 }];
const jillL2: CharacterAbility[] = [{ kind: 'explosivesGoToDiscardInsteadOfTrash', level: 2 }];
const chrisL2: CharacterAbility[] = [{ kind: 'weaponPlusDamagePerInfectedFought', amount: 5, level: 2 }];
const weskerL1: CharacterAbility[] = [{ kind: 'exploreGoldBonus', amount: 20, level: 1 }];
const claireL1: CharacterAbility[] = [{ kind: 'ammunitionBonus', ammoAmount: 10, goldAmount: 0, level: 1 }];
const claireL2: CharacterAbility[] = [{ kind: 'ammunitionBonus', ammoAmount: 0, goldAmount: 10, level: 2 }];

describe('ammoReqForWeapon', () => {
  it('Leon L1: pistols cost 10 less ammo (20 -> 10)', () => {
    expect(ammoReqForWeapon(leonL1, pistol)).toBe(10);
  });
  it('reductions never go below 0', () => {
    const cheapPistol = def('wc', { ammoReq: 5, weaponTags: ['pistol'] });
    expect(ammoReqForWeapon(leonL1, cheapPistol)).toBe(0);
  });
  it('non-matching tags unaffected (Leon vs rifle)', () => {
    expect(ammoReqForWeapon(leonL1, rifle)).toBe(50);
  });
  it('Sheva L2: rifles cost 20 less (50 -> 30)', () => {
    expect(ammoReqForWeapon(shevaL2, rifle)).toBe(30);
  });
  it('no abilities: base cost', () => {
    expect(ammoReqForWeapon([], pistol)).toBe(20);
  });
});

describe('passiveDamageBonus', () => {
  it('Barry L2: each magnum +20', () => {
    expect(passiveDamageBonus(barryL2, [magnum], 0)).toBe(20);
    expect(passiveDamageBonus(barryL2, [magnum, magnum], 0)).toBe(40);
  });
  it('Krauser L2: each knife +5', () => {
    expect(passiveDamageBonus(krauserL2, [knife], 0)).toBe(5);
  });
  it('Jill L1: each explosive +5 (FAQ: applies to Grenade)', () => {
    expect(passiveDamageBonus(jillL1, [grenade], 0)).toBe(5);
    expect(passiveDamageBonus(jillL1, [grenade, grenade], 0)).toBe(10);
  });
  it('Chris L2: +5 per Infected fought', () => {
    expect(passiveDamageBonus(chrisL2, [knife], 1)).toBe(5);
    expect(passiveDamageBonus(chrisL2, [knife], 2)).toBe(10);
  });
  it('non-matching weapons get nothing', () => {
    expect(passiveDamageBonus(barryL2, [pistol], 0)).toBe(0);
  });
});

describe('exploreGoldBonus / ammunitionCardBonus / explosivesGoToDiscard', () => {
  it('Wesker L1: +20 Gold per explore', () => {
    expect(exploreGoldBonus(weskerL1)).toBe(20);
    expect(exploreGoldBonus([])).toBe(0);
  });
  it('Claire L1: ammo cards +10 Ammo; L2: +10 Gold', () => {
    expect(ammunitionCardBonus(claireL1, ammoCard)).toEqual({ ammo: 10, gold: 0 });
    expect(ammunitionCardBonus(claireL2, ammoCard)).toEqual({ ammo: 0, gold: 10 });
    expect(ammunitionCardBonus([...claireL1, ...claireL2], ammoCard)).toEqual({ ammo: 10, gold: 10 });
  });
  it('Claire bonus does not apply to non-ammo cards', () => {
    expect(ammunitionCardBonus(claireL1, pistol)).toEqual({ ammo: 0, gold: 0 });
  });
  it('Jill L2: explosives go to discard', () => {
    expect(explosivesGoToDiscard(jillL2)).toBe(true);
    expect(explosivesGoToDiscard(jillL1)).toBe(false);
    expect(explosivesGoToDiscard([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: real setup() states driven through applyAction
// ---------------------------------------------------------------------------

function gameWith(characterCardId: string, seed = 5): GameState {
  return setup(
    {
      seed,
      players: [
        { name: 'Hero', controller: 'human', characterCardId },
        { name: 'Foe', controller: 'human' },
      ],
    },
    PREMIER_CARDS,
    FIRST_TIMER_PILES
  );
}

/** Force level + hand + pools for deterministic ability tests. */
function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return {
    ...s,
    seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)),
  };
}

function findHand(s: GameState, type: CardDef['type'], tag?: string): string | undefined {
  const p = s.seats[0];
  if (p === undefined) return undefined;
  return p.hand.find(id => {
    const inst = s.cards[id];
    if (inst === undefined) return false;
    const d = s.cardDefs[inst.cardId];
    if (d?.type !== type) return false;
    return tag === undefined || (d.weaponTags ?? []).includes(tag as never);
  });
}

describe('passive abilities through applyAction (level-gated)', () => {
  it('Claire L1: playing an ammo card grants +10 extra Ammo (L1 only)', () => {
    const s = gameWith('ch-003');
    const ammo = findHand(s, 'ammunition');
    expect(ammo).toBeDefined();
    if (ammo === undefined) return;
    // level 0: no bonus — ammo x10 gives just its +10
    const l0 = applyAction(tune(s, { level: 0 as const, turnAmmo: 0, turnGold: 0 }), { type: 'playAmmo', seat: 0, instanceId: ammo });
    expect(l0.seats[0]?.turnAmmo).toBe(10);
    // level 1: +10 extra ammo
    const l1 = applyAction(tune(s, { level: 1 as const, turnAmmo: 0, turnGold: 0 }), { type: 'playAmmo', seat: 0, instanceId: ammo });
    expect(l1.seats[0]?.turnAmmo).toBe(20);
    // level 2: also +10 gold from the ammo card's own +10 => 20 gold
    const l2 = applyAction(tune(s, { level: 2 as const, turnAmmo: 0, turnGold: 0 }), { type: 'playAmmo', seat: 0, instanceId: ammo });
    expect(l2.seats[0]?.turnAmmo).toBe(20);
    expect(l2.seats[0]?.turnGold).toBe(20);
  });

  it('Wesker L1: exploring grants +20 Gold that turn (level-gated)', () => {
    const s = gameWith('ch-001');
    const weapon = findHand(s, 'weapon');
    expect(weapon).toBeDefined();
    if (weapon === undefined) return;
    // level 0: no bonus
    const l0 = applyAction(tune(s, { level: 0 as const, turnAmmo: 90, turnGold: 0 }), { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(l0.seats[0]?.turnGold).toBe(0);
    // level 1: +20 gold on explore
    const l1 = applyAction(tune(s, { level: 1 as const, turnAmmo: 90, turnGold: 0 }), { type: 'explore', seat: 0, weapons: [weapon], exploreCount: 1 });
    expect(l1.seats[0]?.turnGold).toBe(20);
  });

  it('explosive weapons are trashed after use; Jill L2 sends them to discard instead', () => {
    // Use a non-Jill character first: grenade used in explore goes to removed.
    const s = gameWith('ch-008'); // Chris (level 0, no interference)
    const grenaded = tune(s, {
      level: 0 as const,
      turnAmmo: 90,
      hand: ['we-001#1', ...(s.seats[0]?.hand.filter(id => id !== 'we-001#1') ?? [])],
    });
    // Ensure a grenade instance is registered in hand zone for the fixture
    const withGrenade: GameState = {
      ...grenaded,
      cards: {
        ...grenaded.cards,
        'we-001#1': { instanceId: 'we-001#1', cardId: 'we-001', location: { zone: 'hand', index: 0 } },
      },
    };
    const after = applyAction(withGrenade, { type: 'explore', seat: 0, weapons: ['we-001#1'], exploreCount: 1 });
    expect(after.removed).toContain('we-001#1');
    expect(after.seats[0]?.playArea).not.toContain('we-001#1');

    // Jill at L2: the same grenade goes to her discard, not removed.
    const jill = gameWith('ch-009');
    const jillTuned: GameState = {
      ...tune(jill, {
        level: 2 as const,
        decorations: 8,
        turnAmmo: 90,
        hand: ['we-001#1', ...(jill.seats[0]?.hand.filter(id => id !== 'we-001#1') ?? [])],
      }),
      cards: {
        ...jill.cards,
        'we-001#1': { instanceId: 'we-001#1', cardId: 'we-001', location: { zone: 'hand', index: 0 } },
      },
    };
    const afterJill = applyAction(jillTuned, { type: 'explore', seat: 0, weapons: ['we-001#1'], exploreCount: 1 });
    expect(afterJill.removed).not.toContain('we-001#1');
    expect(afterJill.seats[0]?.discard).toContain('we-001#1');
  });

  it('Jill L1 explosive +5 damage flows through exploreDamage', () => {
    const jill = gameWith('ch-009');
    const withGrenade: GameState = {
      ...tune(jill, { level: 0 as const, turnAmmo: 0 }),
      cards: {
        ...jill.cards,
        'we-001#1': { instanceId: 'we-001#1', cardId: 'we-001', location: { zone: 'hand', index: 0 } },
      },
    };
    // level 0: grenade base damage 15
    expect(exploreDamage(withGrenade, 0, ['we-001#1'])).toBe(15);
    // level 1: +5 per explosive
    const l1 = { ...withGrenade, seats: withGrenade.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    expect(exploreDamage(l1, 0, ['we-001#1'])).toBe(20);
  });

  it('Leon L1 pistol ammo reduction flows through requiredAmmoForWeapons', () => {
    const leon0 = gameWith('ch-002');
    // Force a Handgun (we-009, pistol, ammoReq 20) into Leon's hand.
    const leon: GameState = {
      ...tune(leon0, { hand: ['we-009#1', ...(leon0.seats[0]?.hand ?? [])], turnAmmo: 90 }),
      cards: {
        ...leon0.cards,
        'we-009#1': { instanceId: 'we-009#1', cardId: 'we-009', location: { zone: 'hand', index: 0 } },
      },
    };
    const defs = (s: GameState) => (id: string): CardDef | undefined => {
      const inst = s.cards[id];
      return inst === undefined ? undefined : s.cardDefs[inst.cardId];
    };
    // level 0: full 20 ammo required
    expect(requiredAmmoForWeapons(leon, 0, ['we-009#1'], defs(leon))).toBe(20);
    // level 1: pistols -10 => 10
    const l1 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    expect(requiredAmmoForWeapons(l1, 0, ['we-009#1'], defs(l1))).toBe(10);
    // And validate honors it: explore with exactly 10 ammo is legal at L1, not at L0.
    const tenAmmoL0 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 10 } : p)) };
    const tenAmmoL1 = { ...l1, seats: l1.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 10 } : p)) };
    expect(validateAction(tenAmmoL0, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 }).ok).toBe(false);
    expect(validateAction(tenAmmoL1, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 }).ok).toBe(true);
  });

  it('characterAbilities is level-gated', () => {
    const leon = gameWith('ch-002');
    expect(characterAbilities(leon, 0)).toEqual([]); // fresh = level 0
    const l1 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    expect(characterAbilities(l1, 0).map(a => a.kind)).toEqual(['ammoReqReduction']);
    const l2 = { ...leon, seats: leon.seats.map((p, i) => (i === 0 ? { ...p, level: 2 as const } : p)) };
    // L2 keeps L1: ammoReqReduction + pistolsTwicePerTurn.
    expect(characterAbilities(l2, 0).map(a => a.kind).sort()).toEqual(['ammoReqReduction', 'pistolsTwicePerTurn']);
  });
});
describe('batch-2 exotic passives through applyAction', () => {
  it('Chris L1: a healing item cannot target him', () => {
    const s = gameWith('ch-008'); // Chris L1 gate = 0 -> starts with L1
    const herb = findHand(s, 'item');
    // ensure a green herb instance exists in hand
    const withHerb: GameState = {
      ...tune(s, { hand: ['it-001#1', ...(s.seats[0]?.hand ?? [])] }),
      cards: {
        ...s.cards,
        'it-001#1': { instanceId: 'it-001#1', cardId: 'it-001', location: { zone: 'hand', index: 0 } },
      },
    };
    void herb;
    const res = validateAction(withHerb, { type: 'playItem', seat: 0, instanceId: 'it-001#1' });
    expect(res).toEqual({ ok: false, reason: 'playItem: that character cannot be healed' });
    // Another character CAN play the same herb
    const jill = gameWith('ch-009');
    const jillHerb: GameState = {
      ...tune(jill, { hand: ['it-001#1', ...(jill.seats[0]?.hand ?? [])] }),
      cards: {
        ...jill.cards,
        'it-001#1': { instanceId: 'it-001#1', cardId: 'it-001', location: { zone: 'hand', index: 0 } },
      },
    };
    expect(validateAction(jillHerb, { type: 'playItem', seat: 0, instanceId: 'it-001#1' }).ok).toBe(true);
  });

  it('Ada L2: exchange a Buy for an Action (repeatable per Buy)', () => {
    const s = gameWith('ch-006');
    const l2 = tune(s, { level: 2 as const, decorations: 8, buysLeft: 2, actionsLeft: 1 });
    const a1 = applyAction(l2, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(a1.seats[0]?.buysLeft).toBe(1);
    expect(a1.seats[0]?.actionsLeft).toBe(2);
    const a2 = applyAction(a1, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(a2.seats[0]?.buysLeft).toBe(0);
    expect(a2.seats[0]?.actionsLeft).toBe(3);
    // third exchange rejected: no Buy left
    expect(validateAction(a2, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 })).toEqual({ ok: false, reason: 'useCharacterAbility: no Buy left to exchange' });
  });

  it('Wesker L2: target a player -> mustExplore; their endTurn blocked until they explore', () => {
    const s = gameWith('ch-001');
    const l2 = tune(s, { level: 2 as const, decorations: 9 });
    const a1 = applyAction(l2, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(a1.prompts.length).toBe(1);
    expect(a1.prompts[0]?.payload?.kind).toBe('forceExploreOtherPlayer');
    expect(a1.prompts[0]?.options).toEqual(['1']); // the only other seat
    const a2 = applyAction(a1, { type: 'chooseOption', seat: 0, promptId: a1.prompts[0]?.id ?? '', option: 0 });
    expect(a2.seats[1]?.mustExplore).toBe(true);
    expect(a2.seats[0]?.mustExplore).toBeFalsy();
    // seat 1's turn: endTurn is blocked (they hold weapons in hand after setup draw)
    const theirTurn = { ...a2, activeSeat: 1 };
    const canEnd = validateAction(theirTurn, { type: 'endTurn', seat: 1 });
    if ((theirTurn.seats[1]?.hand ?? []).some(id => theirTurn.cards[id]?.cardId.startsWith('we-'))) {
      expect(canEnd).toEqual({ ok: false, reason: 'endTurn: must Explore first (Wesker ability)' });
    } else {
      // weaponless: deadlock guard lets them end the turn
      expect(canEnd.ok).toBe(true);
    }
  });

  it('mustExplore: weapon-but-no-ammo is not an explore option (endTurn allowed, no deadlock)', () => {
    // Regression: canExploreAtAll only checked "holds a weapon". A Handgun
    // (ammoReq 20) with turnAmmo 0 cannot legally be explored, so blocking
    // endTurn deadlocked the player (bots threw 'must Explore first' in sim).
    const s0 = gameWith('ch-001');
    const handgun = 'we-009#x1';
    const rigged: GameState = {
      ...s0,
      phase: 'main',
      activeSeat: 0,
      seats: s0.seats.map((p, i) => (i === 0 ? { ...p, hand: [handgun], turnAmmo: 0, exploresLeft: 1, mustExplore: true } : p)),
      cards: {
        ...s0.cards,
        [handgun]: { instanceId: handgun, cardId: 'we-009', location: { zone: 'hand', index: 0 } },
      },
    };
    // no ammo: the handgun explore is illegal, so endTurn must be allowed
    expect(validateAction(rigged, { type: 'endTurn', seat: 0 })).toEqual({ ok: true });
    expect(validateAction(rigged, { type: 'explore', seat: 0, weapons: [handgun], exploreCount: 1 }).ok).toBe(false);
    // with enough ammo: the explore IS available, so endTurn stays blocked
    const withAmmo: GameState = {
      ...rigged,
      seats: rigged.seats.map((p, i) => (i === 0 ? { ...p, turnAmmo: 20 } : p)),
    };
    expect(validateAction(withAmmo, { type: 'endTurn', seat: 0 })).toEqual({ ok: false, reason: 'endTurn: must Explore first (Wesker ability)' });
    // melee knife with no ammo is also an explore option -> endTurn blocked
    const knife = 'we-004#x1';
    const withKnife: GameState = {
      ...rigged,
      seats: rigged.seats.map((p, i) => (i === 0 ? { ...p, hand: [handgun, knife] } : p)),
      cards: {
        ...rigged.cards,
        [knife]: { instanceId: knife, cardId: 'we-004', location: { zone: 'hand', index: 1 } },
      },
    };
    expect(validateAction(withKnife, { type: 'endTurn', seat: 0 }).ok).toBe(false);
  });

  it('Wesker L2 target gets 2 Explores at their turn start', () => {
    const s = gameWith('ch-001');
    const forced = {
      ...s,
      activeSeat: 1,
      seats: s.seats.map((p, i) => (i === 1 ? { ...p, mustExplore: true } : p)),
    };
    const t = startTurnImpl(forced);
    expect(t.seats[1]?.exploresLeft).toBe(2);
  });

  it('Rebecca L1: effect-trashing offers a redirect prompt; redirect moves to target discard', () => {
    // Ominous Battle (ac-010) trashes 1 card from hand via effect.
    const s0 = gameWith('ch-010');
    const tuned: GameState = {
      ...tune(s0, { level: 1 as const, decorations: 2, hand: ['ac-010#1', 'am-001#1', ...(s0.seats[0]?.hand ?? [])] }),
      cards: {
        ...s0.cards,
        'ac-010#1': { instanceId: 'ac-010#1', cardId: 'ac-010', location: { zone: 'hand', index: 0 } },
        'am-001#1': { instanceId: 'am-001#1', cardId: 'am-001', location: { zone: 'hand', index: 0 } },
      },
    };
    const played = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: 'ac-010#1' });
    const trashPrompt = played.prompts.find(p => p.payload?.kind === 'trashHandCard');
    expect(trashPrompt).toBeDefined();
    if (trashPrompt === undefined) return;
    const trashed = applyAction(played, { type: 'chooseOption', seat: 0, promptId: trashPrompt.id, option: 0 });
    // the redirect prompt follows (Rebecca L1)
    const redirect = trashed.prompts.find(p => p.payload?.kind === 'trashRedirect');
    expect(redirect).toBeDefined();
    if (redirect === undefined) return;
    expect(redirect.options[0]).toBe('Leave in trash');
    expect(redirect.options).toContain('1');
    // send it to seat 1's discard
    const sent = applyAction(trashed, { type: 'chooseOption', seat: 0, promptId: redirect.id, option: 1 });
    expect(sent.seats[1]?.discard.length).toBe((trashed.seats[1]?.discard.length ?? 0) + 1);
    expect(sent.removed.length).toBe(trashed.removed.length - 1);
    // alternatively, leaving it in trash keeps removed as-is
    const kept = applyAction(trashed, { type: 'chooseOption', seat: 0, promptId: redirect.id, option: 0 });
    expect(kept.removed).toEqual(trashed.removed);
    expect(kept.seats[1]?.discard).toEqual(trashed.seats[1]?.discard);
  });

  it('non-Rebecca characters get no redirect prompt', () => {
    const s0 = gameWith('ch-002'); // Leon
    const tuned: GameState = {
      ...tune(s0, { hand: ['ac-010#1', 'am-001#1', ...(s0.seats[0]?.hand ?? [])] }),
      cards: {
        ...s0.cards,
        'ac-010#1': { instanceId: 'ac-010#1', cardId: 'ac-010', location: { zone: 'hand', index: 0 } },
        'am-001#1': { instanceId: 'am-001#1', cardId: 'am-001', location: { zone: 'hand', index: 0 } },
      },
    };
    const played = applyAction(tuned, { type: 'playActionCard', seat: 0, instanceId: 'ac-010#1' });
    const trashPrompt = played.prompts.find(p => p.payload?.kind === 'trashHandCard');
    expect(trashPrompt).toBeDefined();
    if (trashPrompt === undefined) return;
    const trashed = applyAction(played, { type: 'chooseOption', seat: 0, promptId: trashPrompt.id, option: 0 });
    expect(trashed.prompts.find(p => p.payload?.kind === 'trashRedirect')).toBeUndefined();
  });

  it('Leon L2: a pistol can be used a second time from the play area (third rejected)', () => {
    const s0 = gameWith('ch-002');
    const withPistol: GameState = {
      ...tune(s0, { level: 2 as const, decorations: 6, hand: ['we-009#1', ...(s0.seats[0]?.hand ?? [])], turnAmmo: 200, exploresLeft: 3 }),
      cards: {
        ...s0.cards,
        'we-009#1': { instanceId: 'we-009#1', cardId: 'we-009', location: { zone: 'hand', index: 0 } },
      },
    };
    // first use from hand
    const e1 = applyAction(withPistol, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(e1.seats[0]?.playArea).toContain('we-009#1');
    // second use from play area (L2)
    expect(validateAction(e1, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 }).ok).toBe(true);
    const e2 = applyAction(e1, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    // third use rejected (cap 2)
    expect(validateAction(e2, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 })).toEqual({ ok: false, reason: 'explore: weapon not in hand: we-009#1' });
    // Below L2 the second use is illegal
    const l1 = { ...withPistol, seats: withPistol.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    const f1 = applyAction(l1, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 });
    expect(validateAction(f1, { type: 'explore', seat: 0, weapons: ['we-009#1'], exploreCount: 1 }).ok).toBe(false);
  });

  it('Rocket Launcher Case: Take grants the Rocket Launcher and trashes the token', () => {
    // Reveal the token via explore (mansion top forced to ma-012#1)
    const s0 = gameWith('ch-008');
    const rigged: GameState = {
      ...tune(s0, { hand: ['we-004#1', ...(s0.seats[0]?.hand ?? [])], turnAmmo: 90 }),
      mansionDeck: ['ma-012#1', ...(s0.mansionDeck ?? [])],
      cards: {
        ...s0.cards,
        'we-004#1': { instanceId: 'we-004#1', cardId: 'we-004', location: { zone: 'hand', index: 0 } },
        'ma-012#1': { instanceId: 'ma-012#1', cardId: 'ma-012', location: { zone: 'mansionDeck', index: 0 } },
      },
    };
    const explored = applyAction(rigged, { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    const prompt = explored.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const taken = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    // the token is trashed, a Rocket Launcher instance gained to discard
    expect(taken.removed).toContain('ma-012#1');
    expect(taken.seats[0]?.discard).not.toContain('ma-012#1');
    const granted = (taken.seats[0]?.discard ?? []).find(id => taken.cards[id]?.cardId === 'we-008');
    expect(granted).toBeDefined();
  });
});

describe('PR-001 Chris Redfield (promo)', () => {
  it('card data: 90 HP, L1 at 4, L2 at 8, three abilities', () => {
    const def = PREMIER_CARDS.find(c => c.id === 'pr-001');
    expect(def).toBeDefined();
    if (def === undefined) return;
    expect(def.maxHp).toBe(90);
    expect(def.level1At).toBe(4);
    expect(def.level2At).toBe(8);
    expect(def.set).toBe('promo');
    expect(def.abilities?.map(a => a.kind)).toEqual([
      'infectedDamageReduction',
      'weaponDamageReduction',
      'extraExploreAtTurnStart',
    ]);
  });

  it('L1: Infected deal 10 less damage (Zombie attack 10 -> 0)', () => {
    const s = gameWith('pr-001');
    const withZombie: GameState = {
      ...tune(s, { turnAmmo: 0, hand: ['we-004#1', ...(s.seats[0]?.hand ?? [])] }),
      mansionDeck: ['ma-002#1', ...(s.mansionDeck ?? [])],
      cards: {
        ...s.cards,
        'we-004#1': { instanceId: 'we-004#1', cardId: 'we-004', location: { zone: 'hand', index: 0 } },
        'ma-002#1': { instanceId: 'ma-002#1', cardId: 'ma-002', location: { zone: 'mansionDeck', index: 0 } },
      },
    };
    // level 0: takes the full 10
    const l0 = applyAction(withZombie, { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    expect(l0.seats[0]?.hp).toBe(90 - 10);
    // level 1: damage reduced to 0
    const l1state: GameState = { ...withZombie, seats: withZombie.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 4 } : p)) };
    const l1 = applyAction(l1state, { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    expect(l1.seats[0]?.hp).toBe(90);
    // Butcher (attack 20) still hurts: 20 - 10 = 10
    const butcher: GameState = {
      ...l1state,
      mansionDeck: ['ma-004#1', ...(l1state.mansionDeck ?? [])],
      cards: {
        ...l1state.cards,
        'ma-004#1': { instanceId: 'ma-004#1', cardId: 'ma-004', location: { zone: 'mansionDeck', index: 0 } },
      },
    };
    const b = applyAction(butcher, { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    expect(b.seats[0]?.hp).toBe(80);
  });

  it('L2: +1 Explore at the beginning of the turn', () => {
    const s = gameWith('pr-001');
    const l2 = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 2 as const, decorations: 8 } : p)),
    };
    const t = startTurnImpl(l2);
    expect(t.seats[0]?.exploresLeft).toBe(2);
    // level 1: no extra explore
    const l1 = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 4 } : p)),
    };
    expect(startTurnImpl(l1).seats[0]?.exploresLeft).toBe(1);
  });

  it('is dealt like any character (unique pool)', () => {
    // 4 players from the 11-character pool, no duplicates
    const s = setup(
      { seed: 11, players: [ { name: 'a', controller: 'human' }, { name: 'b', controller: 'human' }, { name: 'c', controller: 'human' }, { name: 'd', controller: 'human' } ] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES
    );
    const chars = s.seats.map(p => s.cards[p.characterInstanceId]?.cardId);
    expect(new Set(chars).size).toBe(4);
    // explicit pick works
    const s2 = setup(
      { seed: 11, players: [ { name: 'a', controller: 'human', characterCardId: 'pr-001' }, { name: 'b', controller: 'human' } ] },
      PREMIER_CARDS,
      FIRST_TIMER_PILES
    );
    expect(s2.cards[s2.seats[0]?.characterInstanceId ?? '']?.cardId).toBe('pr-001');
    expect(s2.seats[0]?.maxHp).toBe(90);
  });
});

describe('promo characters PR-002 / PR-009 / PR-010', () => {
  it('card data matches the official scans', () => {
    const jill = PREMIER_CARDS.find(c => c.id === 'pr-002');
    const nurse = PREMIER_CARDS.find(c => c.id === 'pr-009');
    const hunk = PREMIER_CARDS.find(c => c.id === 'pr-010');
    expect(jill).toBeDefined();
    expect(nurse).toBeDefined();
    expect(hunk).toBeDefined();
    if (jill === undefined || nurse === undefined || hunk === undefined) return;
    expect(jill.maxHp).toBe(80);
    expect(jill.level1At).toBe(8);
    expect(jill.level2At).toBeUndefined();
    expect(jill.abilities?.map(a => a.kind)).toEqual(['skipTurnForSuperNextTurn']);
    expect(nurse.maxHp).toBe(70);
    expect(nurse.level1At).toBe(1);
    expect(nurse.level2At).toBe(4);
    expect(nurse.abilities?.map(a => a.kind)).toEqual(['giveOneCardToPlayerThenMaybeAnother', 'exploreDamagePerPlayerWithBigHand']);
    expect(hunk.maxHp).toBe(90);
    expect(hunk.level1At).toBe(2);
    expect(hunk.level2At).toBe(5);
    expect(hunk.abilities?.map(a => a.kind)).toEqual(['revealHandForDamageIfTwoTypes', 'exploreBonusIfActionsInPlayArea']);
  });

  it('PR-002 Jill: skip turn discards hand, ends turn, arms the super turn', () => {
    const s = gameWith('pr-002');
    const l1: GameState = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 8 } : p)) };
    // turn-start prompt offered
    const t = startTurnImpl(l1);
    const skipPrompt = t.prompts.find(p => p.payload?.kind === 'skipTurn');
    expect(skipPrompt).toBeDefined();
    if (skipPrompt === undefined) return;
    expect(skipPrompt.options).toEqual(['Skip my turn', 'Decline']);
    const handBefore = t.seats[0]?.hand.length ?? 0;
    expect(handBefore).toBeGreaterThan(0);
    const skipped = applyAction(t, { type: 'chooseOption', seat: 0, promptId: skipPrompt.id, option: 0 });
    // hand gone to discard, turn passed to seat 1, reward pending
    expect(skipped.seats[0]?.hand).toEqual([]);
    expect(skipped.seats[0]?.skipRewardPending).toBe(true);
    expect(skipped.activeSeat).toBe(1);
    // decline path: no skip
    const t2 = startTurnImpl(l1);
    const p2 = t2.prompts.find(p => p.payload?.kind === 'skipTurn');
    expect(p2).toBeDefined();
    if (p2 === undefined) return;
    const declined = applyAction(t2, { type: 'chooseOption', seat: 0, promptId: p2.id, option: 1 });
    expect(declined.activeSeat).toBe(0);
    expect(declined.seats[0]?.skipRewardPending).toBeFalsy();
  });

  it('PR-002 Jill: super turn = 10 cards, 2 buys/actions/explores', () => {
    const s = gameWith('pr-002');
    const armed: GameState = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 8, skipRewardPending: true } : p)),
    };
    const t = startTurnImpl(armed);
    const p = t.seats[0];
    expect(p?.hand.length).toBe(10);
    expect(p?.actionsLeft).toBe(2);
    expect(p?.buysLeft).toBe(2);
    expect(p?.exploresLeft).toBe(2);
    expect(p?.skipRewardPending).toBe(false);
    // The skip prompt IS offered again on the super turn — the card allows
    // skipping any turn's beginning (validate caps it at once per turn).
    expect(t.prompts.find(pr => pr.payload?.kind === 'skipTurn')).toBeDefined();
  });

  it('PR-009 Rebecca L1: give +1 card, then optionally a second', () => {
    const s = gameWith('pr-009');
    const t = startTurnImpl(s); // L1 gate is 1 decoration... level starts 0
    // level 0: no prompt
    expect(t.prompts.find(p => p.payload?.kind === 'giveOneCardToPlayer')).toBeUndefined();
    const l1: GameState = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 1 } : p)) };
    const t1 = startTurnImpl(l1);
    const gift = t1.prompts.find(p => p.payload?.kind === 'giveOneCardToPlayer');
    expect(gift).toBeDefined();
    if (gift === undefined) return;
    const handBefore = t1.seats[1]?.hand.length ?? 0;
    const given = applyAction(t1, { type: 'chooseOption', seat: 0, promptId: gift.id, option: 0 });
    expect(given.seats[1]?.hand.length).toBe(handBefore + 1);
    // chain prompt for the second gift
    const gift2 = given.prompts.find(p => p.payload?.kind === 'giveOneCardNoChain');
    expect(gift2).toBeDefined();
    if (gift2 === undefined) return;
    const given2 = applyAction(given, { type: 'chooseOption', seat: 0, promptId: gift2.id, option: 0 });
    expect(given2.seats[1]?.hand.length).toBe(handBefore + 2);
  });

  it('PR-009 Rebecca L2: +10 explore damage per player with >5 cards in hand', () => {
    const s = gameWith('pr-009');
    // give every seat a 6th card so all hands exceed the 5-card threshold
    const big: GameState = {
      ...s,
      seats: s.seats.map((p, i) => ({ ...p, level: 2 as const, decorations: 4, hand: [...p.hand, `am-001#x${i}`] })),
      cards: {
        ...s.cards,
        'am-001#x0': { instanceId: 'am-001#x0', cardId: 'am-001', location: { zone: 'hand', index: 9 } },
        'am-001#x1': { instanceId: 'am-001#x1', cardId: 'am-001', location: { zone: 'hand', index: 9 } },
      },
    };
    const hands = big.seats.map(p => p.hand.length);
    expect(hands.every(h => h > 5)).toBe(true);
    const withKnife: GameState = {
      ...big,
      seats: big.seats.map((p, i) => (i === 0 ? { ...p, hand: ['we-004#1', ...p.hand], turnAmmo: 90 } : p)),
      cards: { ...big.cards, 'we-004#1': { instanceId: 'we-004#1', cardId: 'we-004', location: { zone: 'hand', index: 0 } } },
    };
    // 2 players with >5 cards -> +20 on top of knife's 5
    expect(exploreDamage(withKnife, 0, ['we-004#1'])).toBe(25);
    // level 1: no bonus
    const l1: GameState = { ...withKnife, seats: withKnife.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const } : p)) };
    expect(exploreDamage(l1, 0, ['we-004#1'])).toBe(5);
  });

  it('PR-010 Hunk L1: reveal hand with 2+ types grants +10 damage this turn', () => {
    const s = gameWith('pr-010');
    const l1: GameState = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, level: 1 as const, decorations: 2 } : p)) };
    const t = startTurnImpl(l1);
    const reveal = t.prompts.find(p => p.payload?.kind === 'revealHandTwoTypes');
    expect(reveal).toBeDefined();
    if (reveal === undefined) return;
    const revealed = applyAction(t, { type: 'chooseOption', seat: 0, promptId: reveal.id, option: 0 });
    // starting hand = ammo + handgun + knives = 3 types -> +10
    expect(revealed.seats[0]?.weaponDamageBonusThisTurn).toBe(10);
    // decline: no bonus
    const t2 = startTurnImpl(l1);
    const r2 = t2.prompts.find(p => p.payload?.kind === 'revealHandTwoTypes');
    expect(r2).toBeDefined();
    if (r2 === undefined) return;
    const declined = applyAction(t2, { type: 'chooseOption', seat: 0, promptId: r2.id, option: 1 });
    expect(declined.seats[0]?.weaponDamageBonusThisTurn).toBe(0);
  });

  it('PR-010 Hunk L2: +20 explore damage with 4+ Actions in play area', () => {
    const s = gameWith('pr-010');
    const fourActions: GameState = {
      ...s,
      seats: s.seats.map((p, i) =>
        i === 0
          ? { ...p, level: 2 as const, decorations: 5, playArea: ['ac-001#1', 'ac-001#2', 'ac-001#3', 'ac-001#4'], hand: ['we-004#1', ...p.hand], turnAmmo: 90 }
          : p,
      ),
      cards: {
        ...s.cards,
        'we-004#1': { instanceId: 'we-004#1', cardId: 'we-004', location: { zone: 'hand', index: 0 } },
        'ac-001#1': { instanceId: 'ac-001#1', cardId: 'ac-001', location: { zone: 'playArea', index: 0, seat: 0 } },
        'ac-001#2': { instanceId: 'ac-001#2', cardId: 'ac-001', location: { zone: 'playArea', index: 1, seat: 0 } },
        'ac-001#3': { instanceId: 'ac-001#3', cardId: 'ac-001', location: { zone: 'playArea', index: 2, seat: 0 } },
        'ac-001#4': { instanceId: 'ac-001#4', cardId: 'ac-001', location: { zone: 'playArea', index: 3, seat: 0 } },
      },
    };
    // knife 5 + 20
    expect(exploreDamage(fourActions, 0, ['we-004#1'])).toBe(25);
    // only 3 actions: no bonus
    const three: GameState = { ...fourActions, seats: fourActions.seats.map((p, i) => (i === 0 ? { ...p, playArea: p.playArea.slice(0, 3) } : p)) };
    expect(exploreDamage(three, 0, ['we-004#1'])).toBe(5);
  });
});

describe('Yellow Herb (it-002): attach + max HP + owed heal', () => {
  function herbGame(): GameState {
    const s = gameWith('ch-008'); // Chris, maxHp 120
    return {
      ...tune(s, { turnAmmo: 50, hand: ['we-004#1', ...(s.seats[0]?.hand ?? [])] }),
      mansionDeck: ['it-002#1', ...(s.mansionDeck ?? [])],
      cards: {
        ...s.cards,
        'we-004#1': { instanceId: 'we-004#1', cardId: 'we-004', location: { zone: 'hand', index: 0 } },
        'it-002#1': { instanceId: 'it-002#1', cardId: 'it-002', location: { zone: 'mansionDeck', index: 0 } },
      },
    };
  }

  it('take attaches the herb to the character and raises max HP by 10', () => {
    const explored = applyAction(herbGame(), { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    const prompt = explored.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    expect(prompt).toBeDefined();
    if (prompt === undefined) return;
    const taken = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    const p0 = taken.seats[0];
    expect(p0?.maxHp).toBe(130);            // 120 + 10
    expect(p0?.hp).toBe(120);                // current HP unchanged on gain
    expect(p0?.attached).toContain('it-002#1'); // attached to the character, NOT discard
    expect(p0?.discard).not.toContain('it-002#1');
    expect(taken.removed).not.toContain('it-002#1');
    expect(p0?.pendingHerbHeal).toBe(10);    // heal owed next turn
  });

  it('the owed heal applies at the START of the next turn and clears the debt', () => {
    const explored = applyAction(herbGame(), { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    const prompt = explored.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    if (prompt === undefined) return;
    const taken = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    // damage Chris to below 130 so the heal has room to land
    const hurt = { ...taken, seats: taken.seats.map((p, i) => (i === 0 ? { ...p, hp: 70 } : p)) };
    const nextTurn = startTurnImpl(hurt);
    expect(nextTurn.seats[0]?.hp).toBe(80);             // 70 + 10
    expect(nextTurn.seats[0]?.pendingHerbHeal).toBe(0); // debt cleared
    expect(nextTurn.seats[0]?.maxHp).toBe(130);         // max is permanent
    expect(nextTurn.seats[0]?.attached).toContain('it-002#1');
  });

  it('the heal never exceeds max HP', () => {
    const explored = applyAction(herbGame(), { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    const prompt = explored.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    if (prompt === undefined) return;
    const taken = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 0 });
    const nextTurn = startTurnImpl(taken); // hp already 120 == max? no: max now 130, hp 120 -> heals to 130
    expect(nextTurn.seats[0]?.hp).toBe(130);
  });

  it('send-to-bottom does NOT attach (herb returns to the mansion)', () => {
    const explored = applyAction(herbGame(), { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    const prompt = explored.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    if (prompt === undefined) return;
    const declined = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: prompt.id, option: 1 });
    expect(declined.seats[0]?.maxHp).toBe(120);
    expect(declined.seats[0]?.attached).not.toContain('it-002#1');
    expect(declined.mansionBottom).toContain('it-002#1');
  });

  it('two herbs stack: +20 max HP, +20 owed heal', () => {
    const base = herbGame();
    const withTwo: GameState = {
      ...base,
      mansionDeck: ['it-002#1', 'it-002#2', ...(base.mansionDeck ?? [])],
      cards: {
        ...base.cards,
        'it-002#2': { instanceId: 'it-002#2', cardId: 'it-002', location: { zone: 'mansionDeck' as const, index: 1 } },
      },
    };
    const explored = applyAction(withTwo, { type: 'explore', seat: 0, weapons: ['we-004#1'], exploreCount: 1 });
    const p1 = explored.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    if (p1 === undefined) return;
    const t1 = applyAction(explored, { type: 'chooseOption', seat: 0, promptId: p1.id, option: 0 });
    const p2 = t1.prompts.find(p => p.payload?.kind === 'takeOrBottom');
    if (p2 === undefined) return;
    const t2 = applyAction(t1, { type: 'chooseOption', seat: 0, promptId: p2.id, option: 0 });
    expect(t2.seats[0]?.maxHp).toBe(140);
    expect(t2.seats[0]?.pendingHerbHeal).toBe(20);
    expect(t2.seats[0]?.attached).toEqual(expect.arrayContaining(['it-002#1', 'it-002#2']));
  });
});

function cardDefOf(state: GameState, cardId: string): CardDef {
  const def = state.cardDefs[cardId];
  if (def === undefined) throw new Error('missing def ' + cardId);
  return def;
}

describe('Survival Knife (we-005): +5 per other Knife used this turn', () => {
  function knifeGame(): GameState {
    const s = gameWith('ch-008');
    return {
      ...s,
      seats: s.seats.map((p, i) =>
        i === 0
          ? { ...p, hand: ['we-005#1', 'we-004#1', 'we-004#2', 'we-009#1'], turnAmmo: 0, exploresLeft: 3 }
          : p,
      ),
      mansionDeck: ['ma-001#1', 'ma-001#2', 'ma-001#3', ...(s.mansionDeck ?? [])],
      cards: {
        ...s.cards,
        'we-005#1': { instanceId: 'we-005#1', cardId: 'we-005', location: { zone: 'hand', index: 0 } },
        'we-004#1': { instanceId: 'we-004#1', cardId: 'we-004', location: { zone: 'hand', index: 1 } },
        'we-004#2': { instanceId: 'we-004#2', cardId: 'we-004', location: { zone: 'hand', index: 2 } },
        'we-009#1': { instanceId: 'we-009#1', cardId: 'we-009', location: { zone: 'hand', index: 3 } },
        'ma-001#1': { instanceId: 'ma-001#1', cardId: 'ma-001', location: { zone: 'mansionDeck', index: 0 } },
        'ma-001#2': { instanceId: 'ma-001#2', cardId: 'ma-001', location: { zone: 'mansionDeck', index: 1 } },
        'ma-001#3': { instanceId: 'ma-001#3', cardId: 'ma-001', location: { zone: 'mansionDeck', index: 2 } },
      },
    };
  }

  it('alone: base 10, no knife bonus (no OTHER knives)', () => {
    expect(exploreDamage(knifeGame(), 0, ['we-005#1'])).toBe(10);
  });

  it('with 2 combat knives in the same attack: base 10+5+5 plus +5 per other knife (2) = 30', () => {
    expect(exploreDamage(knifeGame(), 0, ['we-005#1', 'we-004#1', 'we-004#2'])).toBe(30);
  });

  it('knives from an EARLIER explore this turn also count', () => {
    const s = knifeGame();
    // first explore: two combat knives (no survival knife) -> 5+5 = 10 dmg
    const after1 = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-004#1', 'we-004#2'], exploreCount: 1 });
    expect(after1.log[after1.log.length - 1]?.action.type).toBe('explore');
    // second explore: survival knife alone now sees 2 earlier knives -> 10 + 10
    expect(exploreDamage(after1, 0, ['we-005#1'])).toBe(20);
  });

  it('knife uses do NOT leak across turns (endTurn resets the count)', () => {
    const s = knifeGame();
    const after1 = applyAction(s, { type: 'explore', seat: 0, weapons: ['we-004#1', 'we-004#2'], exploreCount: 1 });
    const ended = applyAction(after1, { type: 'endTurn', seat: 0 });
    // seat 1's turn now; give seat 0 the knife on a later turn via log scan:
    // knifeWeaponsUsedThisTurn stops at seat 0's endTurn, so count is 0.
    expect(knifeWeaponsUsedThisTurn(ended, 0)).toBe(0);
  });

  it('non-knife weapons in the attack do not trigger the bonus', () => {
    // survival knife (10) + handgun (10, not a knife): no bonus -> 20
    expect(exploreDamage(knifeGame(), 0, ['we-005#1', 'we-009#1'])).toBe(20);
  });

  it('resolveExplore applies the bonus in the real attack path', () => {
    const s = knifeGame();
    const outcome = resolveExplore({
      weapons: [
        { damage: 10, ammoReq: 0, weaponEffects: [{ kind: 'plusDamagePerKnifeUsed', amount: 5 }], tags: ['melee', 'knife'] },
        { damage: 5, ammoReq: 0, tags: ['melee', 'knife'] },
      ],
      ammo: 0,
      bonusDamage: 0,
      revealed: cardDefOf(s, 'ma-001'),
    });
    // 10 + 5 + 5 (one other knife) = 20 >= hp 20 -> defeated
    expect(outcome.kind).toBe('defeated');
  });
});

describe('cardsOnDamageTakenDuringTurn (Nightmare Ada L1)', () => {
  it('draws the amount only during the seat’s own turn', () => {
    const abilities: readonly CharacterAbility[] = [{ kind: 'cardsOnDamageTakenDuringTurn', amount: 2, level: 1 }];
    expect(cardsOnDamageTakenDuringTurn(abilities, true)).toBe(2);
    expect(cardsOnDamageTakenDuringTurn(abilities, false)).toBe(0);
    expect(cardsOnDamageTakenDuringTurn([], true)).toBe(0);
  });
});

describe('applyHpLoss (Nightmare Ada L2)', () => {
  it('replaces lethal damage with the set HP and leaves non-lethal damage alone', () => {
    const abilities: readonly CharacterAbility[] = [{ kind: 'setHpToOnLethal', amount: 10, level: 2 }];
    expect(applyHpLoss(abilities, 5, 20)).toBe(10);   // lethal -> replaced
    expect(applyHpLoss(abilities, 10, 20)).toBe(10);  // lethal -> replaced
    expect(applyHpLoss(abilities, 80, 20)).toBe(60);  // non-lethal -> normal
    expect(applyHpLoss([], 5, 20)).toBe(0);           // no ability -> normal
  });

  it('does not revive an already downed character', () => {
    const abilities: readonly CharacterAbility[] = [{ kind: 'setHpToOnLethal', amount: 10, level: 2 }];
    expect(applyHpLoss(abilities, 0, 10, true)).toBe(0);
  });
});

describe('movesDiscardToInventoryOnDefeat (Luis Sera L2)', () => {
  it('is present only when the character has the ability', () => {
    const abilities: readonly CharacterAbility[] = [{ kind: 'onDefeatMoveDiscardToInventoryBottom', level: 2 }];
    expect(movesDiscardToInventoryOnDefeat(abilities)).toBe(true);
    expect(movesDiscardToInventoryOnDefeat([])).toBe(false);
  });
});
