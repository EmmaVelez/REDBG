import type { CardDef, CharacterAbility, GameState } from '../types';
import { seatAbilities, effectiveWeaponTags } from './abilities';

/**
 * Weapon-reuse rules — "use this weapon more than once per turn".
 *
 * The engine's one such ability is Leon L2 `pistolsTwicePerTurn`: a Pistol can
 * be used TWICE per turn. The two uses may be spent as one double use in a
 * single explore (the official FAQ: "pay its ammo requirement twice for that
 * weapon to apply its effect and damage twice") or split across two explores
 * (the first use moves it out of hand, so the second comes from the play
 * area). One entry in an explore action's `weapons` array is one use.
 * Validation, action enumeration and the UI all read these helpers so the
 * rule cannot drift between layers.
 */

function weaponDef(state: GameState, weaponId: string): CardDef | undefined {
  const inst = state.cards[weaponId];
  if (inst === undefined) return undefined;
  return state.cardDefs[inst.cardId];
}

function hasAbilityKind(state: GameState, seat: number, kind: CharacterAbility['kind']): boolean {
  return seatAbilities(state, seat).some(a => a.kind === kind);
}

/**
 * How many times this weapon has already been used in an explore THIS turn —
 * log scan back to the seat's last endTurn (the in-flight explore is not in
 * the log yet, so it is never counted here).
 *
 * Every entry in a logged explore's `weapons` array is one USE, so a weapon
 * declared twice in one explore (Leon L2: pay the ammo twice, effect and
 * damage twice) counts as two uses.
 */
export function weaponUsesThisTurn(state: GameState, seat: number, weaponId: string): number {
  let uses = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const logged = state.log[i]?.action;
    if (logged === undefined) continue;
    if (logged.type === 'endTurn' && logged.seat === seat) break;
    if (logged.type === 'explore' && logged.seat === seat) {
      for (const id of logged.weapons) {
        if (id === weaponId) uses += 1;
      }
    }
  }
  return uses;
}

/**
 * Uses per turn a weapon gets under the seat's reuse abilities (1 = no reuse).
 * Leon L2 doubles Pistols; everything else stays at one use per turn.
 */
export function maxWeaponUses(state: GameState, seat: number, weaponId: string): number {
  const def = weaponDef(state, weaponId);
  const reusable = hasAbilityKind(state, seat, 'pistolsTwicePerTurn') &&
    effectiveWeaponTags(state, seat, weaponId).includes('pistol');
  return reusable ? 2 : 1;
}

/** Uses still available this turn beyond those already spent (0 = exhausted). */
export function remainingWeaponUses(state: GameState, seat: number, weaponId: string): number {
  return Math.max(maxWeaponUses(state, seat, weaponId) - weaponUsesThisTurn(state, seat, weaponId), 0);
}

/**
 * True when this weapon could be used `times` MORE times this turn. `times` is
 * how many entries the explore action would carry for this instance — 2 is the
 * Leon L2 double use ("pay its ammo requirement twice for that weapon to apply
 * its effect and damage twice"), which spends both uses at once.
 */
export function canUseWeaponTimes(state: GameState, seat: number, weaponId: string, times: number): boolean {
  return weaponUsesThisTurn(state, seat, weaponId) + times <= maxWeaponUses(state, seat, weaponId);
}

/**
 * True when this weapon may be used in an explore even though it is NOT in
 * hand: it sits in the play area, a reuse ability actually applies to it
 * (Leon L2 pistolsTwicePerTurn), and it has uses left. Mirrors the explore
 * validation rule exactly — a weapon with no reuse ability is NOT reusable
 * just because it has a use available.
 */
export function canReuseWeapon(state: GameState, seat: number, weaponId: string): boolean {
  const player = state.seats[seat];
  if (player === undefined) return false;
  if (!player.playArea.includes(weaponId)) return false;
  const max = maxWeaponUses(state, seat, weaponId);
  if (max <= 1) return false;
  return weaponUsesThisTurn(state, seat, weaponId) < max;
}

/**
 * True when this weapon instance is attached to the seat's Partner (Alliance
 * Partner Modification). Attached weapons join the explore attack but are NOT
 * moved to the play area, trashed, or removed by use — they stay attached.
 */
export function isPartnerWeapon(state: GameState, seat: number, weaponId: string): boolean {
  const player = state.seats[seat];
  if (player === undefined) return false;
  return (player.partnerAttached ?? []).includes(weaponId);
}

/**
 * Weapons the seat can use in an explore right now: hand weapons first, then
 * any play-area weapon an ability lets them use again (Leon L2 pistols), then
 * the Partner's attached weapons (Alliance). Deduped and order-stable so the
 * action bar can render it directly.
 */
export function explorableWeapons(state: GameState, seat: number): readonly string[] {
  const player = state.seats[seat];
  if (player === undefined) return [];
  const fromHand = player.hand.filter(id => weaponDef(state, id)?.type === 'weapon');
  const seen = new Set(fromHand);
  const fromPlayArea = player.playArea.filter(
    id => !seen.has(id) && weaponDef(state, id)?.type === 'weapon' && canReuseWeapon(state, seat, id),
  );
  for (const id of fromPlayArea) seen.add(id);
  const fromPartner = (player.partnerAttached ?? []).filter(
    id => !seen.has(id) && weaponDef(state, id)?.type === 'weapon',
  );
  return [...fromHand, ...fromPlayArea, ...fromPartner];
}
