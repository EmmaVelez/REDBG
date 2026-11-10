import type { CharacterAbility, GameState, PlayerState, CardDef, WeaponTag, Prompt } from '../types';
import { drawWithReshuffle } from './deck';
import { abilitiesForLevel, levelForDecorations } from './characters';

/**
 * Passive character-ability queries (batch 1: damage/ammo/economy passives).
 * Every consumer (validate, apply, enumerate, exploreDamage) reads abilities
 * through these helpers so the rules can never drift between layers.
 *
 * Level gating: abilitiesForLevel returns only abilities at or below the
 * player's current level, so a locked tier contributes nothing.
 */

/** The player's character abilities, already filtered to their level. */
export function characterAbilities(state: GameState, seat: number): readonly CharacterAbility[] {
  const player = state.seats[seat];
  if (player === undefined) return [];
  const inst = state.cards[player.characterInstanceId];
  if (inst === undefined) return [];
  const def = state.cardDefs[inst.cardId];
  if (def === undefined) return [];
  return abilitiesForLevel(def.abilities, player.level);
}

/**
 * The Partner's abilities (Alliance Partner Modification).
 *
 * The rulebook: "Your Partner's level is determined by the total Decorations
 * attached to your Main Character, and follows all the same rules outlined in
 * the LEVEL UP! Section." A Partner never holds Decorations of its own, so its
 * level is derived from the Main character's Decorations on the fly — there is
 * no stored partner level to go stale.
 */
export function partnerAbilities(state: GameState, seat: number): readonly CharacterAbility[] {
  const player = state.seats[seat];
  if (player === undefined || player.partnerInstanceId === undefined) return [];
  const inst = state.cards[player.partnerInstanceId];
  if (inst === undefined) return [];
  const def = state.cardDefs[inst.cardId];
  if (def === undefined) return [];
  return abilitiesForLevel(
    def.abilities,
    levelForDecorations(def.level1At, def.level2At, player.decorations),
  );
}

/**
 * Abilities that describe ONE character's own limits or self-targeting effects,
 * so they must never be unioned across the Main and Partner: Krauser as a
 * Partner cannot limit the Main to one weapon, Sherry as a Partner cannot
 * disarm the Main, Chris as a Partner cannot make the Main unhealable, and Ada's
 * "lethal damage leaves her at 10" must not catch the Main.
 *
 * Everything here still resolves normally through `characterAbilities` (the
 * Main) and `leaderAbilities` (whoever is fighting) — this set only governs the
 * union in `seatAbilities`.
 */
const PER_CHARACTER_ONLY: ReadonlySet<string> = new Set([
  // Restrictions on one character's own weapon use / attach options.
  'cannotUseWeapons',
  'singleWeaponLimiter',
  'weaponCostCap',
  'noHealingNoNonInfectedAttach',
  // Self-targeting: they change what happens to one specific character.
  'setHpToOnLethal',
  'infectedDamageReduction',
  'weaponDamageReduction',
  'damageReductionForAmmo',
  'exploreDamageReductionPerHandCard',
]);

/**
 * Every ability the seat can call on: the Main character's plus the Partner's.
 *
 * Alliance Partner Modification — the Partner is "another Character under your
 * control", and a seat shares one hand / discard / inventory / play area, so its
 * abilities are the player's too ("effects that you as the Player will be able
 * to harness"). `PER_CHARACTER_ONLY` keeps one character's personal limits from
 * leaking onto the other.
 */
export function seatAbilities(state: GameState, seat: number): readonly CharacterAbility[] {
  const main = characterAbilities(state, seat);
  const partner = partnerAbilities(state, seat).filter(a => !PER_CHARACTER_ONLY.has(a.kind));
  if (main.length === 0) return partner;
  if (partner.length === 0) return main;
  return [...main, ...partner];
}

/** The Main or Partner's own card def plus the level it has resolved to. */
export interface CharacterAbilitySource {
  readonly def: CardDef;
  readonly level: 0 | 1 | 2;
}

/**
 * Resolve the Main or Partner character's def and level, for actions that name
 * a character (`useCharacterAbility`). The Partner's level follows the Main
 * character's Decorations (Alliance Partner Modification), so it is derived
 * rather than read off PlayerState.
 */
export function characterSource(
  state: GameState,
  seat: number,
  character: 'main' | 'partner',
): CharacterAbilitySource | undefined {
  const player = state.seats[seat];
  if (player === undefined) return undefined;
  const instanceId = character === 'partner' ? player.partnerInstanceId : player.characterInstanceId;
  if (instanceId === undefined) return undefined;
  const inst = state.cards[instanceId];
  if (inst === undefined) return undefined;
  const def = state.cardDefs[inst.cardId];
  if (def === undefined) return undefined;
  const level = character === 'partner'
    ? levelForDecorations(def.level1At, def.level2At, player.decorations)
    : player.level;
  return { def, level };
}

/**
 * Abilities of whichever character is leading the Explore.
 *
 * The leading character is the one fighting, so its restrictions and bonuses
 * apply — not the other character's. Before partner mode this was always the
 * Main character; `partnerLeading`/`action.leader` only decide who takes the
 * damage, so a partner-led explore must also resolve its own abilities.
 */
export function leaderAbilities(
  state: GameState,
  seat: number,
  leader: 'main' | 'partner',
): readonly CharacterAbility[] {
  return leader === 'partner' ? partnerAbilities(state, seat) : characterAbilities(state, seat);
}

/**
 * Ammo requirement of one weapon for this seat, after ammoReqReduction
 * abilities (Leon L1 pistols -10, Sheva L2 rifles -20). Never below 0.
 */
export function ammoReqForWeapon(
  abilities: readonly CharacterAbility[],
  def: CardDef | undefined,
  extraTags: readonly string[] = [],
): number {
  const base = def?.ammoReq ?? 0;
  const tags = new Set<string>(def?.weaponTags ?? []);
  for (const t of extraTags) tags.add(t);
  let reduction = 0;
  for (const ability of abilities) {
    if (ability.kind === 'ammoReqReduction' && tags.has(ability.tag)) {
      reduction += ability.amount;
    }
  }
  return Math.max(base - reduction, 0);
}

/** Total ammo required for an explore's weapon set (ability-aware). */
export function requiredAmmoForWeapons(
  state: GameState,
  seat: number,
  weaponIds: readonly string[],
  defs: (id: string) => CardDef | undefined,
  /** Leading character's abilities; omitted means the Main character's. */
  abilities?: readonly CharacterAbility[],
): number {
  const abils = abilities ?? characterAbilities(state, seat);
  return weaponIds.reduce((sum, id) => sum + ammoReqForWeapon(abils, defs(id), effectiveWeaponTags(state, seat, id)), 0);
}

/** Cost of a card for this seat after any weaponBuyCostReduction (Mikhail
 * Victor L1: all weapons -amount; Billy Coen L1: only weapons carrying the
 * reduction's tag). Called from validate's affordability check, the buy apply
 * path, and the bot's affordable-piles pricing so one rule answers everywhere.
 */
export function buyCostAfterReduction(abilities: readonly CharacterAbility[], def: CardDef | undefined): number {
  if (def === undefined || def.cost === undefined) return def?.cost ?? 0;
  if (def.type !== 'weapon') return def.cost;
  const reduction = abilities.find(a => a.kind === 'weaponBuyCostReduction');
  if (reduction === undefined || reduction.kind !== 'weaponBuyCostReduction') return def.cost;
  if (reduction.tag !== undefined && !(def.weaponTags ?? []).includes(reduction.tag)) return def.cost;
  return Math.max(0, def.cost - reduction.amount);
}

/**
 * Flat damage bonus from passive abilities for one attack:
 * - weaponTagPlusDamage per matching weapon (Barry L2 magnums +20,
 *   Krauser L2 knives +5)
 * - explosivesPlusDamage per explosive weapon used (Jill L1 +5; FAQ: it
 *   applies to each explosive, including the Grenade)
 * - weaponPlusDamagePerInfectedFought: amount x infectedFought (Chris L2 —
 *   "1 weapon gets +5 per Infected he is fighting"; applied to the total,
 *   equivalent to one weapon receiving it)
 */
export function passiveDamageBonus(
  abilities: readonly CharacterAbility[],
  weaponDefs: readonly (CardDef | undefined)[],
  infectedFought: number,
  handCount: number = 0
): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind === 'weaponTagPlusDamage') {
      for (const def of weaponDefs) {
        if (def !== undefined && (def.weaponTags ?? []).includes(ability.tag)) {
          bonus += ability.amount;
        }
      }
    }
    if (ability.kind === 'explosivesPlusDamage') {
      for (const def of weaponDefs) {
        if (def !== undefined && (def.weaponTags ?? []).includes('explosive')) {
          bonus += ability.amount;
        }
      }
    }
    if (ability.kind === 'weaponPlusDamagePerInfectedFought') {
      bonus += ability.amount * Math.max(infectedFought, 0);
    }
    if (ability.kind === 'plusDamagePerCardInHand') {
      bonus += ability.amount * Math.max(handCount, 0);
    }
    if (ability.kind === 'differentWeaponTypesDamageBonus') {
      const tags = new Set<string>();
      for (const def of weaponDefs) {
        for (const t of def?.weaponTags ?? []) tags.add(t);
      }
      if (tags.size >= 2) bonus += ability.amount;
    }
  }
  return bonus;
}

/** Wesker L1: +Gold that turn whenever he Explores. */
export function exploreGoldBonus(abilities: readonly CharacterAbility[]): number {
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'exploreGoldBonus') gold += ability.amount;
  }
  return gold;
}

/**
 * Claire: ammunition cards give extra Ammo (L1) / Gold (L2) when played.
 * Returns the extra pools for one ammo card (0/0 for non-ammo cards or
 * characters without the ability).
 */
export function ammunitionCardBonus(
  abilities: readonly CharacterAbility[],
  def: CardDef | undefined
): { readonly ammo: number; readonly gold: number } {
  if (def?.type !== 'ammunition') return { ammo: 0, gold: 0 };
  let ammo = 0;
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'ammunitionBonus') {
      ammo += ability.ammoAmount;
      gold += ability.goldAmount;
    }
  }
  return { ammo, gold };
}

/**
 * Damage reduction vs Infected attacks for this seat (PR-001 Chris L1: -10).
 * Applied to damageTaken when an explore fails to defeat the Infected.
 */
export function infectedDamageReduction(abilities: readonly CharacterAbility[]): number {
  return abilities.reduce(
    (sum, a) => (a.kind === 'infectedDamageReduction' ? sum + a.amount : sum),
    0
  );
}

/**
 * CU-001 Ricardo Irving L2: "When Ricardo would take more than 30 Damage,
 * you can lower that Damage by 10. In that case, give 10 Damage to any
 * Character." Returns the reduction to apply to a hit of `amount`
 * (0 when the trigger does not fire).
 */
export function ricardoReduction(abilities: readonly CharacterAbility[], amount: number): number {
  for (const a of abilities) {
    if (a.kind === 'damageReductionAndGiveDamage' && amount > a.threshold) return a.reduction;
  }
  return 0;
}

/** The `give` amount for the Ricardo L2 side effect (0 when he has no such ability). */
export function ricardoGiveAmount(abilities: readonly CharacterAbility[]): number {
  for (const a of abilities) {
    if (a.kind === 'damageReductionAndGiveDamage') return a.give;
  }
  return 0;
}

/**
 * Damage reduction vs Weapon attacks for this seat (PR-001 Chris L2: -10).
 * No PvP weapon-attack action exists in the engine yet, so this is encoded
 * for completeness and stays dormant until character-vs-character attacks
 * are implemented.
 */
export function weaponDamageReduction(abilities: readonly CharacterAbility[]): number {
  return abilities.reduce(
    (sum, a) => (a.kind === 'weaponDamageReduction' ? sum + a.amount : sum),
    0
  );
}

/**
 * PR-009 Rebecca L2: while exploring, +amount damage per player (including
 * herself — the card says "each Player") with more than `threshold` cards
 * in hand.
 */
export function exploreBigHandBonus(
  abilities: readonly CharacterAbility[],
  seats: readonly { readonly hand: readonly string[]; readonly dead?: boolean }[]
): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind !== 'exploreDamagePerPlayerWithBigHand') continue;
    const count = seats.filter(s => !s.dead && s.hand.length > ability.threshold).length;
    bonus += ability.amount * count;
  }
  return bonus;
}

/**
 * PR-010 Hunk L2: while exploring, +amount damage when the play area holds
 * at least `minActions` Action cards.
 */
export function exploreActionsBonus(
  abilities: readonly CharacterAbility[],
  playAreaCardTypes: readonly string[],
  isActionType: (cardType: string) => boolean
): number {
  let bonus = 0;
  for (const ability of abilities) {
    if (ability.kind !== 'exploreBonusIfActionsInPlayArea') continue;
    const actions = playAreaCardTypes.filter(t => isActionType(t)).length;
    if (actions >= ability.minActions) bonus += ability.amount;
  }
  return bonus;
}

/** Jill L2: explosive weapons go to discard instead of being trashed. */
/**
 * Survival Knife (WE-005): "This Weapon gets +5 Damage for every other
 * 'Knife' Weapon used this turn." Counts Knife-tagged weapons the seat has
 * already used in EARLIER explores this turn (log scan back to the seat's
 * last endTurn; the in-flight explore is not in the log yet). Knives in the
 * current attack are counted separately by computeDamage.
 */
export function knifeWeaponsUsedThisTurn(state: GameState, seat: number): number {
  let count = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const logged = state.log[i]?.action;
    if (logged === undefined) continue;
    if (logged.type === 'endTurn' && logged.seat === seat) break;
    if (logged.type === 'explore' && logged.seat === seat) {
      for (const weaponId of logged.weapons) {
        const inst = state.cards[weaponId];
        const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
        if ((def?.weaponTags ?? []).includes('knife')) count += 1;
      }
    }
  }
  return count;
}

export function revealHighHpInfectedBonusDamage(
  abilities: readonly CharacterAbility[],
  revealedHp: number
): number {
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind !== 'revealHighHpInfectedBonusDamage') continue;
    if (revealedHp >= a.threshold) bonus += a.amount;
  }
  return bonus;
}

export function explosivesGoToDiscard(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'explosivesGoToDiscardInsteadOfTrash');
}

/**
 * WE-030 Hand Cannon: "This card cannot be attached to characters." Any effect
 * that would attach it must leave it where it is instead.
 */
export function canAttachToCharacter(def: CardDef | undefined): boolean {
  return def?.cannotAttach !== true;
}

/** True when the weapon def is an explosive (tagged). */
export function actionBonus(
  abilities: readonly CharacterAbility[],
  def: CardDef | undefined
): number {
  if (def?.type !== 'action') return 0;
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'actionBonus') gold += ability.amount;
  }
  return gold;
}

export const actionCardBonus = actionBonus;

/**
 * Rebecca L2: trash actions/effects are worth more gold when played.
 * Returns extra gold for an action card whose actionEffects include a trash
 * effect (deck thinning). 0 for non-trash actions or characters without
 * the ability.
 */
export function trashEffectBonus(
  abilities: readonly CharacterAbility[],
  def: CardDef | undefined
): number {
  if (def?.type !== 'action') return 0;
  const hasTrash = (def.actionEffects ?? []).some(e =>
    e.kind === 'trashUpToTwoFromDiscard' ||
    e.kind === 'trashHandCard' ||
    e.kind === 'upgradeAmmoBy30Gold'
  );
  if (!hasTrash) return 0;
  let gold = 0;
  for (const ability of abilities) {
    if (ability.kind === 'trashEffectBonus') gold += ability.amount;
  }
  return gold;
}

/** True when the weapon def is an explosive (tagged). */
export function isExplosive(def: CardDef | undefined): boolean {
  return def?.type === 'weapon' && (def.weaponTags ?? []).includes('explosive');
}

export function exploreOnInfectedDefeat(abilities: readonly CharacterAbility[]): number {
  return abilities.reduce((s, a) => (a.kind === 'exploreOnInfectedDefeat' ? s + a.amount : s), 0);
}

export function trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'trashCardFromDiscardGainCardCostingUpTo20MoreOnInfectedDefeat');
}

export function plusOneCardOnGainCard(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'plusOneCardOnGainCard');
}

export function trashCardFromDiscardOnInfectedDefeat(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'trashCardFromDiscardOnInfectedDefeat');
}

export function discardActionCardFromHandForPlusTwoCards(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'discardActionCardFromHandForPlusTwoCards');
}
/**
 * Ada (Nightmare CH-043) L1: during your turn, if she takes damage, you get
 * +2 cards. `isSelfTurn` is false when the damaged seat is not the active
 * player (e.g. an opponent's AoE reveal effect), which never triggers this.
 */
export function cardsOnDamageTakenDuringTurn(abilities: readonly CharacterAbility[], isSelfTurn: boolean): number {
  if (!isSelfTurn) return 0;
  let draw = 0;
  for (const a of abilities) {
    if (a.kind === 'cardsOnDamageTakenDuringTurn') draw += a.amount;
  }
  return draw;
}

/**
 * Ada (Nightmare CH-043) L2: the HP to set when damage would reduce her to
 * 0 or less (10), or undefined when she has no such ability.
 */
export function setHpToOnLethal(abilities: readonly CharacterAbility[]): number | undefined {
  for (const a of abilities) {
    if (a.kind === 'setHpToOnLethal') return a.amount;
  }
  return undefined;
}

/**
 * Applies an HP loss, then Ada's L2 replacement: when the result would be
 * 0 or less, set it to `amount` instead (user ruling: applies EVERY time).
 * `seatDownedOrDead` skips the replacement so stray AoE damage cannot revive
 * a downed Ada for free.
 */
export function applyHpLoss(abilities: readonly CharacterAbility[], hp: number, amount: number, seatDownedOrDead = false): number {
  const next = Math.max(hp - amount, 0);
  if (next > 0 || seatDownedOrDead) return next;
  return setHpToOnLethal(abilities) ?? next;
}

/**
 * Applies `amount` damage to `seat` through the shared HP-loss choke
 * point, intercepting CU-001 Ricardo Irving L2: a hit greater than the
 * threshold is provisionally lowered by `reduction` and the player is
 * asked to accept (deal `give` to the chosen Character) or decline (the
 * full hit lands — the resolver implements that as re-applying
 * `reduction`). Returns the state (with the prompt queued when the
 * trigger fired) and the resulting HP.
 */
/** Queue the CU-001 Ricardo Irving L2 accept/decline prompt. */
export function queueRicardoL2Prompt(state: GameState, seat: number, amount: number, reduce: number): GameState {
  const give = ricardoGiveAmount(characterAbilities(state, seat));
  const targets = state.seats.filter(s => !s.dead && !s.downed).map(s => String(s.seat));
  return {
    ...state,
    prompts: [...state.prompts, {
      id: `ricardo-l2-${seat}-v${state.version}`,
      seat,
      text: `Ricardo would take ${amount} Damage. Lower it by ${reduce} and give ${give} Damage to any Character?`,
      options: [...targets, 'Decline'],
      payload: { kind: 'ricardoL2', amount: String(amount), reduction: String(reduce), give: String(give) },
    }],
  };
}

/**
 * Applies `amount` damage to `hp` (the Character's current Health),
 * intercepting CU-001 Ricardo Irving L2: a hit greater than the
 * threshold is provisionally lowered by `reduction` and the player is
 * asked to accept (deal `give` to the chosen Character) or decline (the
 * full hit lands — the resolver implements that as re-applying
 * `reduction`). Returns the state (with the prompt queued when the
 * trigger fired) and the resulting HP.
 */
export function applyRicardoDamage(
  state: GameState,
  seat: number,
  hp: number,
  amount: number,
): { readonly state: GameState; readonly hp: number } {
  const player = state.seats[seat];
  if (player === undefined) return { state, hp };
  const abilities = characterAbilities(state, seat);
  const downed = player.downed || player.dead;
  const reduce = downed ? 0 : ricardoReduction(abilities, amount);
  const nextHp = applyHpLoss(abilities, hp, Math.max(amount - reduce, 0), downed);
  if (reduce <= 0) return { state, hp: nextHp };
  return { state: queueRicardoL2Prompt(state, seat, amount, reduce), hp: nextHp };
}

/**
 * Luis Sera (Nightmare CH-036) L2: once he defeats an Infected, the player
 * may move any number of cards from the discard pile to the bottom of the
 * Inventory.
 */
export function movesDiscardToInventoryOnDefeat(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'onDefeatMoveDiscardToInventoryBottom');
}

/**
 * Steve Burnside (Alliance CH-013) L1: recover `amount` HP at the start of
 * each turn (capped at max HP by the caller).
 */
export function healAtTurnStart(abilities: readonly CharacterAbility[]): number {
  let heal = 0;
  for (const a of abilities) {
    if (a.kind === 'healAtTurnStart') heal += a.amount;
  }
  return heal;
}

/**
 * Chris Redfield (Alliance CH-019) L1: -amount ammo requirement, but only
 * when the explore uses exactly one weapon.
 */
export function singleWeaponAmmoDiscount(abilities: readonly CharacterAbility[]): number {
  let amount = 0;
  for (const a of abilities) {
    if (a.kind === 'singleWeaponAmmoDiscount') amount += a.amount;
  }
  return amount;
}

/**
 * Chris Redfield (Alliance CH-019) L2: -amount ammo requirement for weapons
 * whose type is in the player's chosen set.
 */
export function chosenWeaponTypeAmmoDiscount(abilities: readonly CharacterAbility[]): number {
  let amount = 0;
  for (const a of abilities) {
    if (a.kind === 'chosenWeaponTypeAmmoDiscount') amount += a.amount;
  }
  return amount;
}

/**
 * Jill Valentine (Alliance CH-016) L1: +amount explore damage when her
 * partner has `threshold` or fewer cards attached. No partner -> no bonus.
 */
/**
 * Josh Stone (Alliance CH-012) L1: cannot use weapons costing maxCost or
 * more. Returns undefined when the character has no such restriction.
 */
export function weaponCostCap(abilities: readonly CharacterAbility[]): number | undefined {
  for (const a of abilities) {
    if (a.kind === 'weaponCostCap') return a.maxCost;
  }
  return undefined;
}

/**
 * Claire Redfield (Alliance CH-020) L1: +amount damage this turn when a
 * Green Herb or Red Herb is trashed from hand.
 */
export function herbTrashDamageBonus(abilities: readonly CharacterAbility[]): number {
  let amount = 0;
  for (const a of abilities) {
    if (a.kind === 'herbTrashDamageBonus') amount += a.amount;
  }
  return amount;
}

/** Mark Wilkins (Outbreak CH-024) L1: +amount damage when using threshold+ weapons. */
export function plusDamageIfTwoOrMoreWeapons(
  abilities: readonly CharacterAbility[],
  weaponCount: number,
): number {
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind === 'plusDamageIfTwoOrMoreWeapons' && weaponCount >= a.threshold) bonus += a.amount;
  }
  return bonus;
}

/** Chris Redfield (Outbreak CH-028) L2: +amount explore damage when ammo > threshold. */
export function exploreBonusIfAmmoAbove(
  abilities: readonly CharacterAbility[],
  ammo: number,
): number {
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind === 'exploreBonusIfAmmoAbove' && ammo > a.threshold) bonus += a.amount;
  }
  return bonus;
}

/**
 * Rebecca Chambers (Outbreak CH-029) L2: when an effect decreases ANOTHER
 * character's Infection Level, she gets +1 card. Returns the seats that
 * should draw (never the character whose level dropped).
 */
export function seatsDrawingOnOtherInfectionDecrease(
  state: GameState,
  decreasedSeat: number,
): readonly number[] {
  const out: number[] = [];
  for (const s of state.seats) {
    if (s.seat === decreasedSeat || s.dead) continue;
    const inst = state.cards[s.characterInstanceId];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    const has = (def?.abilities ?? []).some(a => a.kind === 'drawWhenOtherInfectionDecreases' && a.level <= s.level);
    if (has) out.push(s.seat);
  }
  return out;
}

/** Apply Rebecca L2's +1 card for each qualifying seat. */
export function applyInfectionDecreaseDraws(state: GameState, decreasedSeat: number): GameState {
  let s = state;
  for (const seatIdx of seatsDrawingOnOtherInfectionDecrease(s, decreasedSeat)) {
    const p = s.seats[seatIdx] as PlayerState | undefined;
    if (p === undefined) continue;
    const d = drawWithReshuffle({ deck: p.inventory, discard: p.discard, count: 1, rngState: s.rngState });
    s = {
      ...s,
      rngState: d.rngState,
      seats: s.seats.map(x => (x.seat === seatIdx
        ? { ...x, hand: [...x.hand, ...d.hand], inventory: d.deck, discard: d.discard }
        : x)),
    };
  }
  return s;
}
/**
 * Jill Valentine (Outbreak CH-025) L2: while her Infection Level is 0 she
 * and her partner cannot be affected by any infection effects.
 */
export function isImmuneToInfectionEffects(
  abilities: readonly CharacterAbility[],
  infectionCards: readonly string[] | undefined,
): boolean {
  if ((infectionCards?.length ?? 0) !== 0) return false;
  return abilities.some(a => a.kind === 'immuneToInfectionAtLevelZero');
}
/** HUNK (Outbreak CH-030) L2: +amount base damage when Health <= threshold. */
export function baseDamageBonusIfHpAtMost(
  abilities: readonly CharacterAbility[],
  hp: number,
): number {
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind === 'baseDamageBonusIfHpAtMost' && hp <= a.threshold) bonus += a.amount;
  }
  return bonus;
}
/** Carlos Oliveira (Alliance CH-011) L2: perfect-explore reward. */
export function hasPerfectExploreReward(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'perfectExploreReward');
}
/** Claire Redfield (Alliance CH-020) L2: double all damage this turn. */
export function hasDoubleDamageOnBothHerbs(abilities: readonly CharacterAbility[]): boolean {
  return abilities.some(a => a.kind === 'doubleDamageOnBothHerbs');
}
/** Partner attach cap: 2 by default, Josh L2 adds 2. */
export function partnerAttachCap(abilities: readonly CharacterAbility[]): number {
  let cap = 2;
  for (const a of abilities) {
    if (a.kind === 'partnerAttachCapBonus') cap += a.amount;
  }
  return cap;
}
export function partnerAttachedDamageBonus(
  abilities: readonly CharacterAbility[],
  partnerAttached: readonly string[] | undefined,
): number {
  if (partnerAttached === undefined) return 0;
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind === 'partnerAttachedCountDamageBonus' && partnerAttached.length <= a.threshold) bonus += a.amount;
  }
  return bonus;
}

/** CR-001 Claire Redfield L1 (TACTICIAN): flat +amount Buy. */
export function plusBuyBonus(abilities: readonly CharacterAbility[]): number {
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind === 'plusBuyPassive') bonus += a.amount;
  }
  return bonus;
}

/** LK-001 Leon L2 (RAPID FIRE): every card in the seat's play area counts
 *  as a Pistol, so any "is this a pistol" check must read the effective
 *  tags rather than the printed weaponTags. */
export function playAreaCardsArePistols(state: GameState, seat: number): boolean {
  return characterAbilities(state, seat).some(a => a.kind === 'playAreaCardsArePistols');
}

export function effectiveWeaponTags(state: GameState, seat: number, instanceId: string): readonly string[] {
  const def = state.cardDefs[state.cards[instanceId]?.cardId ?? ''];
  const tags = [...(def?.weaponTags ?? [])];
  if (!tags.includes('pistol')) {
    const player = state.seats[seat];
    if ((player?.playArea ?? []).includes(instanceId) && playAreaCardsArePistols(state, seat)) {
      tags.push('pistol');
    }
  }
  return tags;
}

export function isPistolWeapon(state: GameState, seat: number, instanceId: string): boolean {
  return effectiveWeaponTags(state, seat, instanceId).includes('pistol');
}

/** LK-001 Leon L1 (DUAL WIELD): +amount per pistol when using threshold+
 *  pistols in one explore. */
export function dualWieldBonus(
  state: GameState,
  seat: number,
  abilities: readonly CharacterAbility[],
  weaponIds: readonly string[],
): number {
  let bonus = 0;
  for (const a of abilities) {
    if (a.kind !== 'plusDamagePerPistolUsed') continue;
    const pistols = weaponIds.filter(id => isPistolWeapon(state, seat, id)).length;
    if (pistols >= a.threshold) bonus += a.amount * pistols;
  }
  return bonus;
}

/** CC-001 Claire Redfield L2: heal `heal` when the player defeats an
 *  Infected with a weapon carrying `tag`. */
export function healOnDefeatWithWeaponTag(
  state: GameState,
  seat: number,
  abilities: readonly CharacterAbility[],
  weaponIds: readonly string[],
): number {
  let heal = 0;
  for (const a of abilities) {
    if (a.kind !== 'healOnDefeatWithWeaponTag') continue;
    if (weaponIds.some(id => effectiveWeaponTags(state, seat, id).includes(a.tag))) heal += a.heal;
  }
  return heal;
}
