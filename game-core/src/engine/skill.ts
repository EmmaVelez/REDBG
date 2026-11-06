import type { CardDef, GameState, PlayerState, Prompt, SkillDraftState, SkillEffect } from '../types';
import { makeRng, shuffle } from '../util/rng';
import { drawWithReshuffle } from './deck';
import { flipDown } from './characters';
import { characterAbilities, applyHpLoss } from './abilities';

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

/** Flattened effects of all active Skills for a seat. */
export function activeSkillEffects(state: GameState, seat: number): readonly SkillEffect[] {
  const out: SkillEffect[] = [];
  for (const id of activeSkillIds(state, seat)) {
    const inst = state.cards[id];
    const def = inst === undefined ? undefined : state.cardDefs[inst.cardId];
    if (def?.skillEffects) out.push(...def.skillEffects);
  }
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
  return {
    id: `skill-draft-keep-${draft.keepSeat}-k${draft.keepPicks}-v${state.version}`,
    seat: draft.keepSeat,
    text: `Skill Draft — keep 3 of your 5 chosen Skills (${draft.keepPicks}/3 kept).`,
    options: [...kept],
    payload: { kind: 'skillDraftKeep' },
  };
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
  if (keepPicks >= 3) {
    keepSeat += 1;
    keepPicks = 0;
    if (keepSeat >= n) done = true;
  }
  if (done) {
    return finishDraft(state, { ...draft, kept: newKept, final });
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
    return { ...s, skills: kept, xp: 0 };
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
): number {
  let bonus = 0;
  for (const e of effects) {
    if (e.kind === 'exploreAllWeaponsPlusDamage') bonus += e.amount * weaponDefs.length;
    if (e.kind === 'explorePistolPlusDamage') {
      bonus += e.amount * weaponDefs.filter(d => (d?.weaponTags ?? []).includes('pistol')).length;
    }
  }
  return bonus;
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
  const newHp = applyHpLoss(abilities, player.hp, amount, player.downed || player.dead);
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
      ? { ...s, hp: flip.hp, downed: flip.downed, dead: flip.dead, hand: flip.hand, discard: flip.discard, inventory: flip.inventory, playArea: [] }
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
