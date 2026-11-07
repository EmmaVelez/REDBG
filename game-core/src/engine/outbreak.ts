import type { CardDef, GameState, PlayerState, Prompt } from '../types';
import { characterAbilities, applyHpLoss } from './abilities';

/**
 * Outbreak expansion — engine support for the infected effects that were
 * previously only present as card text (MA-045 Wasp, MA-048 Crimson Head,
 * MA-049 Reinforced Licker).
 *
 * Called from the explore reducer's reveal branch; returns a NEW state plus
 * the per-battle bonuses the caller must fold into `resolveExplore`.
 */
export interface OutbreakRevealContext {
  /** The exploring seat. */
  readonly seat: number;
  readonly revealedInstanceId: string;
  readonly revealedDef: CardDef;
  /** Instance ids of the weapons used in this explore. */
  readonly weapons: readonly string[];
  /** Attached card instance ids on the exploring character. */
  readonly attached: readonly string[];
}

export interface OutbreakRevealResult {
  readonly state: GameState;
  readonly prompts: readonly Prompt[];
  /** Weapons whose damage is zeroed for this explore (MA-049). */
  readonly zeroDamageWeaponIds: readonly string[];
  /** Bonus HP granted to the revealed Infected for this battle (MA-048). */
  readonly revealedHpBonus: number;
  /** Bonus Damage granted to the revealed Infected for this battle (MA-048). */
  readonly revealedAttackBonus: number;
  /** Cards moved to the bottom of the Mansion (MA-054o Kevlar Jacket). */
  readonly movedToBottom: readonly string[];
}

export function applyOutbreakRevealEffects(state: GameState, ctx: OutbreakRevealContext): OutbreakRevealResult {
  const def = ctx.revealedDef;
  if (def.type !== 'infected') {
    return { state, prompts: [], zeroDamageWeaponIds: [], revealedHpBonus: 0, revealedAttackBonus: 0, movedToBottom: [] };
  }

  let s = state;
  let zeroDamageWeaponIds: string[] = [];
  let revealedHpBonus = 0;
  let revealedAttackBonus = 0;
  let movedToBottom: string[] = [];

  for (const e of def.infectedEffects ?? []) {
    switch (e.kind) {
      case 'onRevealFlatDamageToExploringCharacters': {
        // MA-045 Wasp: "When revealed, the exploring characters each take 20
        // damage." A face-down character is out of the game, so it is skipped.
        const player = s.seats[ctx.seat];
        if (player === undefined || player.dead || player.downed) break;
        const kevlar = applyDamageWithKevlar(s, ctx.seat, e.amount);
        s = kevlar.state;
        movedToBottom = [...movedToBottom, ...kevlar.movedIds];
        const newHp = applyHpLoss(characterAbilities(s, ctx.seat), player.hp, kevlar.damage, player.downed || player.dead);
        s = { ...s, seats: s.seats.map(x => (x.seat === ctx.seat ? { ...x, hp: newHp } : x)) };
        break;
      }
      case 'onRevealBonusIfZombieAttached': {
        // MA-048 Crimson Head: +10 HP and +10 Damage this turn when the
        // exploring character has an attached Infected with "Zombie" in its name.
        const player = s.seats[ctx.seat];
        if (player === undefined) break;
        const hasZombie = player.attached.some(id => {
          const inst = s.cards[id];
          const d = inst === undefined ? undefined : s.cardDefs[inst.cardId];
          return d?.type === 'infected' && d.name.toLowerCase().includes('zombie');
        });
        if (hasZombie) {
          revealedHpBonus += e.hp;
          revealedAttackBonus += e.damage;
        }
        break;
      }
      case 'onRevealZeroAmmoWeaponsDealNoDamage': {
        // MA-049 Reinforced Licker: weapons with a 0 Ammo requirement deal 0
        // damage this turn.
        for (const wid of ctx.weapons) {
          const inst = s.cards[wid];
          const d = inst === undefined ? undefined : s.cardDefs[inst.cardId];
          if ((d?.ammoReq ?? 0) === 0) zeroDamageWeaponIds.push(wid);
        }
        break;
      }
      default:
        break;
    }
  }

  return { state: s, prompts: [], zeroDamageWeaponIds, revealedHpBonus, revealedAttackBonus, movedToBottom };
}

/**
 * MA-056o Laser Trap / MA-057o Rock Trap damage.
 *
 * Both are "When revealed ... Then remove this card from the game" events, so
 * the caller removes the revealed card and applies the returned damage to the
 * exploring character.
 */
export function outbreakTrapDamage(
  def: CardDef,
  playAreaTypes: readonly string[],
  actionCardsInPlayArea: number,
): number {
  if (def.type !== 'event') return 0;
  if (def.id === 'ma-056o') {
    return 20 * new Set(playAreaTypes).size;
  }
  if (def.id === 'ma-057o') {
    return 10 * actionCardsInPlayArea;
  }
  return 0;
}

/**
 * MA-054o Kevlar Jacket: the exploring character may move the attached jacket
 * to the bottom of the Mansion instead of taking damage this turn.
 */
export function kevlarJacketPreventsDamage(state: GameState, seat: number): boolean {
  const player = state.seats[seat] as PlayerState | undefined;
  if (player === undefined) return false;
  return player.attached.some(id => {
    const inst = state.cards[id];
    const d = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    return d?.id === 'ma-054o';
  });
}

/**
 * Apply damage to a seat, honouring MA-054o Kevlar Jacket.
 *
 * The jacket is a one-shot: when the wearer would take damage, the jacket is
 * moved to the bottom of the Mansion and the damage is prevented. The engine
 * auto-takes the beneficial option (the alternative — a prompt at every damage
 * site — would need the damage held across the prompt, which the reducer does
 * not support); the jacket leaves play either way, so it cannot absorb a second
 * hit.
 */
export function applyDamageWithKevlar(
  state: GameState,
  seat: number,
  damage: number,
): { state: GameState; damage: number; movedIds: readonly string[] } {
  if (damage <= 0) return { state, damage, movedIds: [] };
  const player = state.seats[seat] as PlayerState | undefined;
  if (player === undefined || player.dead) return { state, damage, movedIds: [] };
  const jacketId = player.attached.find(id => state.cards[id]?.cardId === 'ma-054o');
  if (jacketId === undefined) return { state, damage, movedIds: [] };
  return {
    state: {
      ...state,
      seats: state.seats.map(s => (s.seat === seat ? { ...s, attached: s.attached.filter(id => id !== jacketId) } : s)),
      mansionBottom: [...state.mansionBottom, jacketId],
    },
    damage: 0,
    movedIds: [jacketId],
  };
}
