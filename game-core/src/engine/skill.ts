import type { CardDef, GameState, PlayerState, PendingSkillEffect, Prompt, SkillDraftState, SkillEffect, CharacterAbility } from '../types';
import { makeRng, shuffle } from '../util/rng';
import { drawWithReshuffle } from './deck';
import { flipDown } from './characters';
import { characterAbilities, applyHpLoss, applyRicardoDamage, effectiveWeaponTags, isPistolWeapon } from './abilities';
import { startTurn } from './game';

/**
 * Mercenaries Skill System — shared queries and the opening draft.
 *
 * A Skill card (SK-001..SK-030) is active once the XP on it reaches its
 * printed `skillXp`. XP is earned by Exploring (+1 per explore) and moved
 * from the Character onto a Skill as a free action during the player's turn
 * (manual: "may move any amount of XP ... at any time during their turn
 * while their Character is NOT Exploring").
 *
 * The opening draft is a 5-round pass-left draft (deal 5 each, pick 1 and
 * pass 4 left), then each player keeps 3 of their 5 chosen cards. It is
 * driven entirely by `chooseOption` prompts — see `draftPrompt` /
 * `advanceDraft`.
 */

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All Skill card defs in the database (SK-001..SK-030). */
export function skillCardDefs(cards: ReadonlyArray<CardDef>): ReadonlyArray<CardDef> {
  return cards.filter(c => c.type === 'skill');
}

/** XP sitting on a Skill instance (0 when absent). */
export function skillXpOn(state: GameState, skillInstanceId: string): number {
  return state.cards[skillInstanceId]?.xp ?? 0;
}

/** A Skill's printed XP requirement. */
export function skillXpRequired(state: GameState, skillInstanceId: string): number {
  const inst = state.cards[skillInstanceId];
  const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
  return def?.skillXp ?? 0;
}

/** A Skill is active once the XP on it reaches its requirement. */
export function isSkillActive(state: GameState, skillInstanceId: string): boolean {
  const inst = state.cards[skillInstanceId];
  if (inst === undefined) return false;
  const def = state.cardDefs[inst.cardId];
  if (def === undefined || def.type !== 'skill') return false;
  return skillXpOn(state, skillInstanceId) >= (def.skillXp ?? 0);
}

/** Active Skill instance ids for a seat. */
export function activeSkillIds(state: GameState, seat: number): readonly string[] {
  const player = state.seats[seat];
  if (player === undefined) return [];
  return (player.skills ?? []).filter(id => isSkillActive(state, id));
}

/** True when the seat has an active SK-009 (Luck LV.3) among its Skills. */
function hasCopyActivatedSkills(state: GameState, seat: number): boolean {
  return activeSkillIds(state, seat).some(id => {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    return def?.type === 'skill' && (def.skillEffects ?? []).some(e => e.kind === 'copyActivatedSkills');
  });
}

/** Flattened effects of all active Skills for a seat.
 *
 *  SK-009 Luck LV.3 ("This Skill is considered to have the same effect(s) as
 *  your other activated Skills") is implemented as a stacking copy: the other
 *  active Skills' effects are appended a second time, so a copied passive
 *  (Toughness LV.2 -10 damage, Medic LV.1 +10 healing, ...) applies twice.
 *  SK-009 itself contributes no effect of its own. */
export function activeSkillEffects(state: GameState, seat: number): readonly SkillEffect[] {
  const out: SkillEffect[] = [];
  for (const id of activeSkillIds(state, seat)) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    if (def?.type !== 'skill') continue;
    if ((def.skillEffects ?? []).some(e => e.kind === 'copyActivatedSkills')) continue;
    if (def.skillEffects) out.push(...def.skillEffects);
  }
  if (out.length > 0 && hasCopyActivatedSkills(state, seat)) out.push(...out);
  return out;
}

/** XP on a seat's Character. */
export function characterXp(state: GameState, seat: number): number {
  return state.seats[seat]?.xp ?? 0;
}

/** Total Infected attached to ALL Characters (Extension skills). */
export function totalInfectedAttached(state: GameState): number {
  return state.seats.reduce((sum, s) => sum + (s.dead ? 0 : s.attached.length), 0);
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

/** Build the Skill deck instance ids (one copy each) from the card database. */
export function buildSkillDeck(cards: ReadonlyArray<CardDef>): readonly string[] {
  const ids: string[] = [];
  for (const def of cards) {
    if (def.type !== 'skill') continue;
    for (let j = 0; j < def.copies; j++) ids.push(`${def.id}#${j + 1}`);
  }
  return ids;
}

/** The pending draft prompt for the current draft state, if any. */
export function draftPrompt(state: GameState): Prompt | undefined {
  const draft = state.skillDraft;
  if (draft === undefined) return undefined;
  if (draft.step === 'pick') {
    const hand = draft.hands[draft.pickSeat] ?? [];
    if (hand.length === 0) return undefined;
    return {
      id: `skill-draft-pick-${draft.pickSeat}-r${draft.round}-v${state.version}`,
      seat: draft.pickSeat,
      text: `Skill Draft — round ${draft.round + 1} of 5: choose 1 Skill card.`,
      options: [...hand],
      payload: { kind: 'skillDraftPick' },
    };
  }
  const kept = draft.kept[draft.keepSeat] ?? [];
  if (kept.length === 0) return undefined;
  const keepTarget = draft.keepTarget;
  return {
    id: `skill-draft-keep-${draft.keepSeat}-k${draft.keepPicks}-v${state.version}`,
    seat: draft.keepSeat,
    text: `Skill Draft — keep ${keepTarget} of your 5 chosen Skills (${draft.keepPicks}/${keepTarget} kept).`,
    options: [...kept],
    payload: { kind: 'skillDraftKeep' },
  };
}

/**
 * The seat whose choice the game is currently waiting on: the draft's
 * pick/keep seat during the opening Skill Draft (`activeSeat` stays 0 until
 * the draft finishes), otherwise the active seat. Bot stepping and the
 * pass-and-play hand-off both key off this.
 */
export function seatAwaitingAction(state: GameState): number {
  const draft = state.skillDraft;
  if (draft !== undefined) {
    return draft.step === 'pick' ? draft.pickSeat : draft.keepSeat;
  }
  return state.activeSeat;
}

/**
 * Advance the draft after a pick/keep choice. `state` must already carry the
 * resolved prompt's removal and the bumped version/log (i.e. `nextBase`).
 * Returns the state with the next draft prompt appended.
 */
export function advanceDraft(state: GameState, seat: number, chosenId: string): GameState {
  const draft = state.skillDraft;
  if (draft === undefined) return state;
  const n = state.seats.length;

  if (draft.step === 'pick') {
    const hand = draft.hands[seat] ?? [];
    if (!hand.includes(chosenId)) return state;
    const kept = { ...draft.kept, [seat]: [...(draft.kept[seat] ?? []), chosenId] };
    const pendingPass = { ...draft.pendingPass, [seat]: hand.filter(id => id !== chosenId) };
    let hands = { ...draft.hands, [seat]: [] };
    let pickSeat = draft.pickSeat + 1;
    let round = draft.round;
    let step: SkillDraftState['step'] = draft.step;
    let keepSeat = draft.keepSeat;
    let keepPicks = draft.keepPicks;
    let nextPending = pendingPass;

    if (pickSeat >= n) {
      // End of round: pass the remaining cards left (seat i receives from i-1).
      const rotated: Record<number, readonly string[]> = {};
      for (let i = 0; i < n; i++) rotated[i] = pendingPass[(i - 1 + n) % n] ?? [];
      hands = rotated;
      nextPending = {};
      round += 1;
      pickSeat = 0;
      if (round >= 5) {
        step = 'keep';
        keepSeat = 0;
        keepPicks = 0;
      }
    }

    const nextDraft: SkillDraftState = {
      ...draft,
      hands,
      kept,
      pendingPass: nextPending,
      round,
      pickSeat,
      step,
      keepSeat,
      keepPicks,
    };
    return withDraftPrompt({ ...state, skillDraft: nextDraft });
  }

  // keep step
  const kept = draft.kept[seat] ?? [];
  if (!kept.includes(chosenId)) return state;
  const final = { ...draft.final, [seat]: [...(draft.final[seat] ?? []), chosenId] };
  const newKept = { ...draft.kept, [seat]: kept.filter(id => id !== chosenId) };
  let keepSeat = draft.keepSeat;
  let keepPicks = draft.keepPicks + 1;
  let done = false;
  if (keepPicks >= draft.keepTarget) {
    keepSeat += 1;
    keepPicks = 0;
    if (keepSeat >= n) done = true;
  }
  if (done) {
    // The draft is over: the opening turn starts now, exactly as it does
    // after every endTurn. Without this the first turn would run on the raw
    // setup pools and skip every turn-start effect (CR-001's +1 Buy,
    // Carlos's Gold, the Skill System's opening ammo/gold, ...).
    return startTurn(finishDraft(state, { ...draft, kept: newKept, final }));
  }
  const nextDraft: SkillDraftState = { ...draft, kept: newKept, final, keepSeat, keepPicks };
  return withDraftPrompt({ ...state, skillDraft: nextDraft });
}

function withDraftPrompt(state: GameState): GameState {
  const prompt = draftPrompt(state);
  return prompt === undefined ? state : { ...state, prompts: [...state.prompts, prompt] };
}

/** Draft complete: kept Skills go to the Skill Area, the rest leave the game. */
function finishDraft(state: GameState, draft: SkillDraftState): GameState {
  const removed = [...state.removed, ...draft.deck];
  const seats = state.seats.map((s, i) => {
    const kept = draft.final[i] ?? [];
    const dropped = (draft.kept[i] ?? []).filter(id => !kept.includes(id));
    removed.push(...dropped);
    // Partner Modification: each Character a Player controls can only have 1
    // Skill, so the second kept Skill belongs to the partner Character.
    const partnerSkillId = draft.keepTarget < 3 && kept.length >= 2 ? kept[1] : undefined;
    return { ...s, skills: kept, xp: 0, ...(partnerSkillId !== undefined ? { partnerSkillId } : {}) };
  });
  return {
    ...state,
    phase: 'main',
    seats,
    removed,
    skillDraft: undefined,
    skillDeck: undefined,
    prompts: [],
  };
}

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

/** Move XP from the Character onto one of its Skills (free action). */
export function moveXp(state: GameState, seat: number, skillInstanceId: string, amount: number): GameState {
  const player = state.seats[seat];
  const inst = state.cards[skillInstanceId];
  if (player === undefined || inst === undefined) return state;
  const xp = player.xp ?? 0;
  const on = inst.xp ?? 0;
  return {
    ...state,
    seats: state.seats.map(s => (s.seat === seat ? { ...s, xp: xp - amount } : s)),
    cards: { ...state.cards, [skillInstanceId]: { ...inst, xp: on + amount } },
  };
}

/** Remove all XP from a Skill (deactivates it). */
export function clearSkillXp(state: GameState, skillInstanceId: string): GameState {
  const inst = state.cards[skillInstanceId];
  if (inst === undefined) return state;
  return { ...state, cards: { ...state.cards, [skillInstanceId]: { ...inst, xp: 0 } } };
}

// ---------------------------------------------------------------------------
// Reactive Skills (SK-008 Luck LV.2 / SK-010 Toughness LV.1 / SK-012 LV.3)
// ---------------------------------------------------------------------------

export interface ReactiveConsumption {
  readonly state: GameState;
  /** SK-008 or SK-010 fired: the event is negated. */
  readonly negated: boolean;
  /** SK-012 fired: the seat the event is redirected to. */
  readonly redirectSeat?: number;
}

/**
 * Consume the first pending reaction of the given kinds. The owning Skill's XP
 * is removed (the printed cost of the reaction) and the declaration is dropped.
 */
function consumePending(
  state: GameState,
  seat: number,
  kinds: readonly PendingSkillEffect['kind'][],
): { readonly state: GameState; readonly consumed?: PendingSkillEffect } {
  const player = state.seats[seat];
  if (player === undefined) return { state };
  const pending = (player.pendingSkillEffects ?? []).find(e => kinds.includes(e.kind));
  if (pending === undefined) return { state };
  const skillInstanceId = (pending as { readonly skillInstanceId?: string }).skillInstanceId;
  const cleared = skillInstanceId === undefined ? state : clearSkillXp(state, skillInstanceId);
  return {
    state: {
      ...cleared,
      seats: cleared.seats.map(s => (s.seat === seat
        ? { ...s, pendingSkillEffects: (s.pendingSkillEffects ?? []).filter(e => e !== pending) }
        : s)),
    },
    consumed: pending,
  };
}

/** SK-008 Luck LV.2: consume a declared "negate the next Damage" reaction. */
export function consumeNegateDamage(state: GameState, seat: number): ReactiveConsumption {
  const { state: next, consumed } = consumePending(state, seat, ['negateNextDamage']);
  return { state: next, negated: consumed !== undefined };
}

/** SK-010 / SK-012: consume a declared Infected-effect reaction. */
export function consumeInfectedEffectReaction(state: GameState, seat: number): ReactiveConsumption {
  const { state: next, consumed } = consumePending(state, seat, ['negateNextInfectedEffect', 'redirectNextInfectedEffect']);
  if (consumed === undefined) return { state: next, negated: false };
  if (consumed.kind === 'redirectNextInfectedEffect') {
    return { state: next, negated: false, redirectSeat: consumed.targetSeat };
  }
  return { state: next, negated: true };
}

/**
 * Partner Modification: when the partner Character dies, its Skill and any XP
 * on it are Removed from the Game. Returns the updated state (the partner
 * instance itself is detached by the caller).
 */
export function removePartnerSkill(state: GameState, seat: number): GameState {
  const player = state.seats[seat];
  const skillId = player?.partnerSkillId;
  if (player === undefined || skillId === undefined) return state;
  return {
    ...state,
    seats: state.seats.map(s => (s.seat === seat ? { ...s, partnerSkillId: undefined } : s)),
    removed: [...state.removed, skillId],
  };
}

// ---------------------------------------------------------------------------
// Passive helpers (consumed by validate / apply / explore / startTurn)
// ---------------------------------------------------------------------------

/** SK-011 Toughness LV.2: reduce all damage the Character takes. */
export function skillDamageReduction(effects: readonly SkillEffect[]): number {
  return effects.reduce((sum, e) => (e.kind === 'damageReduction' ? sum + e.amount : sum), 0);
}

/** SK-004 Medic LV.1: bonus added to any heal. */
export function skillHealAmountBonus(effects: readonly SkillEffect[]): number {
  return effects.reduce((sum, e) => (e.kind === 'healAmountBonus' ? sum + e.amount : sum), 0);
}

/** SK-005 Medic LV.2: may trash 1 discard card when healing. */
export function skillHealTrashFromDiscard(effects: readonly SkillEffect[]): boolean {
  return effects.some(e => e.kind === 'healTrashFromDiscard');
}

/** SK-028 Handgun Technique LV.1: -N ammo requirement for Pistol weapons. */
export function skillPistolAmmoDiscount(effects: readonly SkillEffect[]): number {
  return effects.reduce((sum, e) => (e.kind === 'pistolAmmoDiscount' ? sum + e.amount : sum), 0);
}

/** SK-007 Luck LV.1: damage taken instead when a hit would be lethal. */
export function skillLethalReplacementAmount(effects: readonly SkillEffect[]): number | undefined {
  for (const e of effects) if (e.kind === 'lethalDamageReplacement') return e.amount;
  return undefined;
}

/** SK-022 Giant Killing LV.1: threshold for the damage-suppression trigger. */
export function skillGiantKillingThreshold(effects: readonly SkillEffect[]): number | undefined {
  for (const e of effects) if (e.kind === 'giantKillingReduceDamage') return e.hpThreshold;
  return undefined;
}

/** Explore damage bonus from passive Skills (SK-020 all weapons, SK-030 pistols). */
export function exploreSkillDamageBonus(
  effects: readonly SkillEffect[],
  weaponDefs: readonly (CardDef | undefined)[],
  state?: GameState,
  seat?: number,
  weaponIds?: readonly string[],
): number {
  let bonus = 0;
  for (const e of effects) {
    if (e.kind === 'exploreAllWeaponsPlusDamage') bonus += e.amount * weaponDefs.length;
    if (e.kind === 'explorePistolPlusDamage') {
      let pistols = 0;
      for (let i = 0; i < weaponDefs.length; i++) {
        const id = weaponIds?.[i];
        const tags = id !== undefined && state !== undefined && seat !== undefined
          ? effectiveWeaponTags(state, seat, id)
          : (weaponDefs[i]?.weaponTags ?? []);
        if (tags.includes('pistol')) pistols += 1;
      }
      bonus += e.amount * pistols;
    }
    if (e.kind === 'exploreExplosivePlusDamage') {
      let explosives = 0;
      for (let i = 0; i < weaponDefs.length; i++) {
        const id = weaponIds?.[i];
        const tags = id !== undefined && state !== undefined && seat !== undefined
          ? effectiveWeaponTags(state, seat, id)
          : (weaponDefs[i]?.weaponTags ?? []);
        if (tags.includes('explosive')) explosives += 1;
      }
      bonus += e.amount * explosives;
    }
  }
  return bonus;
}

/**
 * SK-035 Bomber LV.2: how many extra uses an "Explosive" weapon gets before it
 * is Trashed (0 when the Skill is not active).
 */
export function skillExplosiveExtraUses(effects: readonly SkillEffect[]): number {
  return effects.reduce((sum, e) => (e.kind === 'explosiveExtraUse' ? sum + e.count : sum), 0);
}

/**
 * SK-036 Bomber LV.3: the damage the "Explosive" weapons deal in an explore —
 * each Explosive weapon's own damage plus the bonuses that apply per Explosive
 * weapon (Jill L1 `explosivesPlusDamage`, SK-034, ...). The Skill deals this
 * amount to EACH revealed Infected.
 */
export function exploreExplosiveDamage(
  effects: readonly SkillEffect[],
  abilities: readonly CharacterAbility[],
  weapons: readonly { readonly damage: number; readonly tags?: readonly string[] }[],
): number {
  const explosives = weapons.filter(w => (w.tags ?? []).includes('explosive'));
  if (explosives.length === 0) return 0;
  let total = explosives.reduce((sum, w) => sum + w.damage, 0);
  for (const a of abilities) {
    if (a.kind === 'explosivesPlusDamage' || (a.kind === 'weaponTagPlusDamage' && a.tag === 'explosive')) {
      total += a.amount * explosives.length;
    }
  }
  for (const e of effects) {
    if (e.kind === 'exploreExplosivePlusDamage') total += e.amount * explosives.length;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Turn-start effects (SK-001/002/003/006/017)
// ---------------------------------------------------------------------------

export interface TurnStartSkillResult {
  ammo: number;
  gold: number;
  heal: number;
  explores: number;
  damageThisTurn: number;
}

/**
 * Conditional turn-start Skills. "Team Decorations" is read as the player's own
 * Decorations (Mercenary Mode teams are out of scope).
 */
export function turnStartSkillEffects(state: GameState, seat: number): TurnStartSkillResult {
  const effects = activeSkillEffects(state, seat);
  const player = state.seats[seat];
  const infected = totalInfectedAttached(state);
  const decorations = player?.decorations ?? 0;
  const out: TurnStartSkillResult = { ammo: 0, gold: 0, heal: 0, explores: 0, damageThisTurn: 0 };
  for (const e of effects) {
    if (e.kind === 'extensionAmmoAtTurnStart' && (infected >= e.infectedAttached || decorations >= e.decorations)) {
      out.ammo += e.amount;
    } else if (e.kind === 'extensionDamageAndHealAtTurnStart' && (infected >= e.infectedAttached || decorations >= e.decorations)) {
      out.damageThisTurn += e.damage;
      out.heal += e.heal;
    } else if (e.kind === 'extensionExploreAtTurnStart' && (infected >= e.infectedAttached || decorations >= e.decorations)) {
      out.explores += 1;
    } else if (e.kind === 'healAtTurnStartOrElseExplore') {
      if (player !== undefined && player.hp >= player.maxHp) out.explores += 1;
      else out.heal += e.heal;
    } else if (e.kind === 'turnStartGoldAndAmmo') {
      out.gold += e.gold;
      out.ammo += e.ammo;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Turn-start prompts (SK-029)
// ---------------------------------------------------------------------------

/**
 * SK-029 Handgun Technique LV.2: "At the beginning of your turn, you can
 * Reveal 2 'Pistol' Weapons from your Hand. In that case, you get +1 Explore
 * during this turn." Offered once per turn while the Skill is active and the
 * hand actually holds that many Pistols.
 */
export function turnStartSkillPrompts(state: GameState, seat: number, newVersion: number): GameState['prompts'] {
  const player = state.seats[seat];
  if (player === undefined) return [];
  const prompts: Prompt[] = [];
  for (const id of activeSkillIds(state, seat)) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    if (def?.type !== 'skill') continue;
    for (const e of def.skillEffects ?? []) {
      if (e.kind !== 'revealPistolsForExplore') continue;
      const pistols = player.hand.filter(hid => {
        const hInst = state.cards[hid];
        const hDef = hInst === undefined ? undefined : state.cardDefs[hInst.cardId];
        return hDef?.type === 'weapon' && isPistolWeapon(state, seat, hid);
      });
      if (pistols.length < e.count) continue;
      prompts.push({
        id: `skill-reveal-pistols-${seat}-v${newVersion}`,
        seat,
        text: `Reveal ${e.count} "Pistol" Weapons from your Hand to get +1 Explore this turn?`,
        options: ['Reveal', 'Decline'],
        payload: { kind: 'skillRevealPistolsForExplore', skillInstanceId: id, count: e.count },
      });
    }
  }
  return prompts;
}

// ---------------------------------------------------------------------------
// Manual ("can") Skills
// ---------------------------------------------------------------------------

function withPrompt(state: GameState, prompt: Prompt): GameState {
  return { ...state, prompts: [...state.prompts, prompt] };
}

/** Apply damage to the Character, flipping them down when it reaches 0. */
function damageCharacter(state: GameState, seat: number, amount: number): GameState {
  const player = state.seats[seat];
  if (player === undefined || amount <= 0) return state;
  const abilities = characterAbilities(state, seat);
  const ric = applyRicardoDamage(state, seat, player.hp, amount);
  state = ric.state;
  const newHp = ric.hp;
  if (newHp > 0 || player.downed || player.dead) {
    return { ...state, seats: state.seats.map(s => (s.seat === seat ? { ...s, hp: newHp } : s)) };
  }
  let rng = makeRng(state.rngState);
  const rngShuffle = (items: readonly string[]): string[] => {
    const r = shuffle(rng, items);
    rng = r.rng;
    return [...r.value];
  };
  const flip = flipDown(
    {
      hp: newHp,
      maxHp: player.maxHp,
      decorations: player.decorations,
      level: player.level,
      downed: false,
      dead: false,
      hand: player.hand,
      discard: player.discard,
      inventory: player.inventory,
    },
    rngShuffle,
  );
  return {
    ...state,
    rngState: rng.s,
    seats: state.seats.map(s => (s.seat === seat
      ? { ...s, hp: flip.hp, downed: flip.downed, dead: flip.dead, hand: flip.hand, discard: flip.discard, inventory: flip.inventory }
      : s)),
  };
}

/**
 * Apply a manual ("can") Skill. The Skill must already be validated as active,
 * owned by the seat, and unused this turn. Choice-based effects park a prompt
 * and resolve through chooseOption.
 */
export function applyUseSkill(state: GameState, seat: number, skillInstanceId: string): GameState {
  const player = state.seats[seat];
  const inst = state.cards[skillInstanceId];
  if (player === undefined || inst === undefined) return state;
  const def = state.cardDefs[inst.cardId];
  if (def === undefined) return state;
  const version = state.version;
  const pid = `skill-use-${skillInstanceId}-v${version}`;
  const clearXp = (): GameState => ({
    ...state,
    cards: { ...state.cards, [skillInstanceId]: { ...inst, xp: 0 } },
  });

  for (const effect of def.skillEffects ?? []) {
    switch (effect.kind) {
      case 'selfDamageForCardsAndAction': {
        // SK-013 Reversal LV.1
        let next = damageCharacter(state, seat, effect.damage);
        const p = next.seats[seat] as PlayerState;
        const d = drawWithReshuffle({ deck: p.inventory, discard: p.discard, count: effect.cards, rngState: next.rngState });
        next = {
          ...next,
          rngState: d.rngState,
          seats: next.seats.map(s => (s.seat === seat
            ? { ...s, hand: [...s.hand, ...d.hand], inventory: d.deck, discard: d.discard, actionsLeft: s.actionsLeft + effect.actions }
            : s)),
          cards: { ...next.cards, [skillInstanceId]: { ...(next.cards[skillInstanceId] as NonNullable<GameState['cards'][string]>), xp: 0 } },
        };
        return next;
      }
      case 'selfDamageForTrashDiscard': {
        // SK-014 Reversal LV.2
        let next = damageCharacter(clearXp(), seat, effect.damage);
        const p = next.seats[seat] as PlayerState;
        if (p.discard.length === 0) return next;
        return withPrompt(next, {
          id: `${pid}-trash`,
          seat,
          text: 'Trash up to 2 cards in your Discard Pile.',
          options: [...p.discard, 'DONE'],
          payload: { kind: 'trashUpToTwoFromDiscard', trashed: 0 },
        });
      }
      case 'trashAmmoForAmmo': {
        // SK-016 Smart Reload LV.1
        const candidates = player.hand.filter(id => {
          const d = state.cards[id] === undefined ? undefined : state.cardDefs[state.cards[id].cardId];
          return d?.type === 'ammunition' && (d.cost ?? 0) === 0;
        });
        if (candidates.length === 0) return state;
        return withPrompt(state, {
          id: pid,
          seat,
          text: 'Trash an Ammunition with a cost of 0 from your Hand.',
          options: candidates,
          payload: { kind: 'smartReloadTrashAmmo' },
        });
      }
      case 'movePlayAreaWeaponToInventoryTop': {
        // SK-018 Smart Reload LV.3
        const candidates = player.playArea.filter(id => state.cards[id] === undefined ? false : state.cardDefs[state.cards[id].cardId]?.type === 'weapon');
        if (candidates.length === 0) return state;
        return withPrompt(state, {
          id: pid,
          seat,
          text: 'Move a weapon from your Play Area to the top of your Inventory.',
          options: candidates,
          payload: { kind: 'skillMovePlayAreaWeaponToInventoryTop' },
        });
      }
      case 'nameWeaponTypeAmmoDiscount': {
        // SK-019 Weapon Master LV.1
        const types = new Set<string>();
        for (const id of [...player.hand, ...player.playArea]) {
          const d = state.cards[id] === undefined ? undefined : state.cardDefs[state.cards[id].cardId];
          if (d?.type === 'weapon' && d.weaponType !== undefined) types.add(d.weaponType);
        }
        if (types.size === 0) return state;
        return withPrompt(state, {
          id: pid,
          seat,
          text: 'Name a weapon type: all of your Weapons of that type get -10 Ammo Requirement this turn.',
          options: [...types],
          payload: { kind: 'skillNameWeaponType' },
        });
      }
      case 'removeXpForTrashHand': {
        // SK-026 Maximizer LV.2
        if ((player.xp ?? 0) < 1 || player.hand.length === 0) return state;
        const next: GameState = {
          ...state,
          seats: state.seats.map(s => (s.seat === seat ? { ...s, xp: (s.xp ?? 0) - 1 } : s)),
        };
        return withPrompt(next, {
          id: pid,
          seat,
          text: 'Trash 1 card in your Hand.',
          options: [...player.hand],
          payload: { kind: 'trashHandCard' },
        });
      }
      case 'exploreBonusDamagePerCharacterDamage': {
        // SK-015 Reversal LV.3
        return {
          ...clearXp(),
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'reversalBonusPerCharacterDamage' }] }
            : s)),
        };
      }
      case 'giantKillingPlusDamage': {
        // SK-023 Giant Killing LV.2
        return {
          ...state,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'giantKillingPlusDamage', amount: effect.amount }] }
            : s)),
        };
      }
      case 'giantKillingAllWeaponsPlusDamage': {
        // SK-024 Giant Killing LV.3
        return {
          ...state,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'giantKillingAllWeaponsPlusDamage', amount: effect.amount }] }
            : s)),
        };
      }
      case 'exploreDuplicateWeaponEffect': {
        // SK-021 Weapon Master LV.3
        const candidates = [...player.hand, ...player.playArea].filter(id => state.cards[id] === undefined ? false : state.cardDefs[state.cards[id].cardId]?.type === 'weapon');
        if (candidates.length === 0) return state;
        return withPrompt(state, {
          id: pid,
          seat,
          text: 'Choose 1 Weapon your Character is using to apply its effect twice during this turn.',
          options: candidates,
          payload: { kind: 'skillDuplicateWeaponEffect' },
        });
      }
      case 'removeXpForWeaponDamage': {
        // SK-027 Maximizer LV.3
        const candidates = [...player.hand, ...player.playArea].filter(id => state.cards[id] === undefined ? false : state.cardDefs[state.cards[id].cardId]?.type === 'weapon');
        if (candidates.length === 0 || (player.xp ?? 0) < 1) return state;
        return withPrompt(state, {
          id: pid,
          seat,
          text: 'Choose 1 Weapon your Character is using to get +10 Damage per XP removed.',
          options: candidates,
          payload: { kind: 'skillRemoveXpForWeaponDamage' },
        });
      }
      case 'negateDamageRemoveXp': {
        // SK-008 Luck LV.2 — arm a reaction that negates the next Damage.
        return {
          ...state,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'negateNextDamage', skillInstanceId }] }
            : s)),
        };
      }
      case 'negateInfectedEffectRemoveXp': {
        // SK-010 Toughness LV.1 — arm a reaction that negates the next
        // Infected effect that would affect this Character.
        return {
          ...state,
          seats: state.seats.map(s => (s.seat === seat
            ? { ...s, pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'negateNextInfectedEffect', skillInstanceId }] }
            : s)),
        };
      }
      case 'redirectInfectedEffectRemoveXp': {
        // SK-012 Toughness LV.3 — choose another Player to be affected instead.
        const targets = state.seats.filter(s => s.seat !== seat && !s.dead).map(s => String(s.seat));
        if (targets.length === 0) return state;
        return withPrompt(state, {
          id: pid,
          seat,
          text: "Choose another Player to be affected by the Infected's effect instead.",
          options: targets,
          payload: { kind: 'skillRedirectInfectedEffect', skillInstanceId },
        });
      }
      default:
        // Passive / reactive / unimplemented-as-manual kinds are not triggered
        // here (see the damage, heal and explore paths).
        return state;
    }
  }
  return state;
}

/** Resolve the XP-amount step of SK-027 (Maximizer LV.3). */
export function resolveSkillXpAmount(state: GameState, seat: number, skillInstanceId: string, weaponInstanceId: string, amount: number): GameState {
  const player = state.seats[seat];
  if (player === undefined || amount < 1 || amount > (player.xp ?? 0)) return state;
  return {
    ...state,
    seats: state.seats.map(s => (s.seat === seat
      ? {
          ...s,
          xp: (s.xp ?? 0) - amount,
          pendingSkillEffects: [...(s.pendingSkillEffects ?? []), { kind: 'removeXpForWeaponDamage', weaponInstanceId, amount }],
        }
      : s)),
    cards: { ...state.cards, [skillInstanceId]: { ...(state.cards[skillInstanceId] as NonNullable<GameState['cards'][string]>), xp: 0 } },
  };
}
