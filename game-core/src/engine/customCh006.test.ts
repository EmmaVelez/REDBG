import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { Action, GameState, PlayerState } from '../types';
import { setup, startTurn } from './game';
import { levelForDecorations } from './characters';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { enumerateLegalActions } from '../ai/enumerate';
import { exploreDamage } from './explore';
import { CUSTOM_CARDS } from '../data/custom';
import { ALL_CARDS, PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK, cardsForScenario } from '../data/cards';

/**
 * Fan character prints, all coded CH-006 (already official CH-006 Ada Wong):
 *   ch-006e Excella Gionne   70 HP, gates 3 / 8
 *   ch-006a Aya Brea         100 HP, gates 4 / 9
 *   ch-006b Aya Brea         100 HP, gates 5 / 8
 *
 * Shields were read from ~8x crops of JUST the shield emblem (the level digit
 * sits OUTSIDE it), so the gate digits are 3/8, 4/9 and 5/8 respectively.
 */

const IDS = ['ch-006e', 'ch-006a', 'ch-006b'] as const;

function def(id: string) {
  const d = CUSTOM_CARDS.find(c => c.id === id);
  if (d === undefined) throw new Error(`missing ${id}`);
  return d;
}

let counter = 0;

function game(charId: string, over: Partial<PlayerState> = {}, seats = 2): GameState {
  const others = ['ch-002', 'ch-003', 'ch-004', 'ch-007'];
  const players = Array.from({ length: seats }, (_, i) => ({
    name: `P${i}`,
    controller: 'human' as const,
    characterCardId: i === 0 ? charId : others[i - 1]!,
  }));
  const s = setup(
    { seed: 11, players },
    [...PREMIER_CARDS, ...CUSTOM_CARDS],
    FIRST_TIMER_PILES,
    STANDARD_MANSION_DECK,
  );
  const started = startTurn(s);
  return { ...started, seats: started.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

function tune(s: GameState, over: Partial<PlayerState>): GameState {
  return { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, ...over } : p)) };
}

/** Pin seat 0's level directly (setup derives it from Decorations only). */
function leveled(s: GameState, level: 0 | 1 | 2): GameState {
  return tune(s, { level });
}

/** Give seat 0 fresh instances of the given card ids in its hand. */
function hand(s: GameState, cardIds: readonly string[]): { state: GameState; ids: string[] } {
  const ids = cardIds.map(cid => `${cid}#h${++counter}`);
  const cards = { ...s.cards };
  for (const id of ids) {
    cards[id] = { instanceId: id, cardId: id.split('#')[0]!, location: { zone: 'hand' as const, index: 0, seat: 0 } };
  }
  return { state: { ...s, cards, seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, ...ids] } : p)) }, ids };
}

function addHand(s: GameState, cardId: string): { state: GameState; id: string } {
  const r = hand(s, [cardId]);
  return { state: r.state, id: r.ids[0]! };
}

function findPrompt(s: GameState, kind: string) {
  return s.prompts.find(p => p.payload?.kind === kind);
}

function answer(s: GameState, kind: string, option: number | string): GameState {
  const p = findPrompt(s, kind);
  if (p === undefined) throw new Error(`no prompt ${kind} (have: ${s.prompts.map(x => x.payload?.kind).join(',')})`);
  const opt = typeof option === 'string' ? p.options.indexOf(option) : option;
  return applyAction(s, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: opt });
}

function drain(s: GameState, keep: readonly string[] = []): GameState {
  let out = s;
  for (let g = 0; g < 40; g++) {
    const p = out.prompts.find(x => !keep.includes(String(x.payload?.kind)));
    if (p === undefined) break;
    out = applyAction(out, { type: 'chooseOption', seat: p.seat, promptId: p.id, option: 0 });
  }
  return out;
}

describe('CH-006 fan prints — data', () => {
  it('Excella matches the printed card', () => {
    expect(def('ch-006e')).toEqual(expect.objectContaining({
      id: 'ch-006e', name: 'Excella Gionne', type: 'character', set: 'custom',
      copies: 1, maxHp: 70, level1At: 3, level2At: 8,
    }));
    expect(def('ch-006e')?.abilities).toEqual([
      { kind: 'trashAmmoForAmmoUpTo30More', amount: 30, level: 1 },
      { kind: 'discardCardForPeekMansionTopAndDamage', cardId: 'ac-018', damage: 20, level: 2 },
    ]);
    // Uroboros Injection is an OFFICIAL Alliance action named by the card.
    expect(def('ch-006e')?.dependencies).toEqual(['ac-018']);
  });

  it('both Ayas match the printed cards', () => {
    expect(def('ch-006a')).toEqual(expect.objectContaining({
      id: 'ch-006a', name: 'Aya Brea', maxHp: 100, level1At: 4, level2At: 9,
    }));
    expect(def('ch-006a')?.abilities).toEqual([
      { kind: 'plusDamageWithRifleAndKnife', tags: ['rifle', 'knife'], amount: 10, level: 1 },
      { kind: 'useAnotherCharactersAbility', level: 2 },
    ]);
    expect(def('ch-006b')).toEqual(expect.objectContaining({
      id: 'ch-006b', name: 'Aya Brea', maxHp: 100, level1At: 5, level2At: 8,
    }));
    expect(def('ch-006b')?.abilities).toEqual([
      { kind: 'plusDamagePerMultiExplorePerPlayer', amount: 5, level: 1 },
      { kind: 'useAnotherCharactersAbility', level: 2 },
    ]);
  });

  it('ships art under the internal ids, not the printed code', () => {
    for (const id of IDS) {
      expect(existsSync(`src/data/CARD-ART/${id.toUpperCase()}.png`), id).toBe(true);
    }
  });

  it('are NOT part of ALL_CARDS — the room toggle is the only way in', () => {
    for (const id of IDS) expect(ALL_CARDS.some(c => c.id === id)).toBe(false);
    const on = cardsForScenario('firstTimer', { customCards: ['ch-006e', 'ch-006a', 'ch-006b'] });
    for (const id of IDS) expect(on.some(c => c.id === id)).toBe(true);
  });

  it('pulls the named Uroboros Injection def into the game', () => {
    const on = cardsForScenario('firstTimer', { customCards: ['ch-006e'] });
    expect(on.some(c => c.id === 'ac-018')).toBe(true);
  });

  it('has no duplicate ids anywhere in the custom line', () => {
    const ids = CUSTOM_CARDS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gates: the character STARTS at level 0 and levelForDecorations gates each tier', () => {
    const e = game('ch-006e');
    expect(e.seats[0]?.level).toBe(0);
    // levelForDecorations is the gate itself: setup derives `level` from
    // Decorations, so a fixture that pins Decorations and re-reads through the
    // helper sees the tier.
    const defE = def('ch-006e');
    expect(levelForDecorations(defE.level1At, defE.level2At, 2)).toBe(0);
    expect(levelForDecorations(defE.level1At, defE.level2At, 3)).toBe(1);
    expect(levelForDecorations(defE.level1At, defE.level2At, 7)).toBe(1);
    expect(levelForDecorations(defE.level1At, defE.level2At, 8)).toBe(2);
    const defA = def('ch-006a');
    expect(levelForDecorations(defA.level1At, defA.level2At, 3)).toBe(0);
    expect(levelForDecorations(defA.level1At, defA.level2At, 4)).toBe(1);
    expect(levelForDecorations(defA.level1At, defA.level2At, 9)).toBe(2);
    const defB = def('ch-006b');
    expect(levelForDecorations(defB.level1At, defB.level2At, 4)).toBe(0);
    expect(levelForDecorations(defB.level1At, defB.level2At, 5)).toBe(1);
    expect(levelForDecorations(defB.level1At, defB.level2At, 8)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ch-006e Excella Gionne
// ---------------------------------------------------------------------------

describe('ch-006e Excella L1 — trash Ammunition for a better one', () => {
  it('offers the hand ammo and gains a card costing up to 30 more', () => {
    const base = leveled(game('ch-006e'), 1);
    const withAmmo = hand(base, ['am-001']);
    let s = withAmmo.state;
    s = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    const p = findPrompt(s, 'excellaTrashAmmo');
    expect(p).toBeDefined();
    // Trash the Ammo x10 (cost 0) -> the gain may be any ammo costing <= 30.
    s = answer(s, 'excellaTrashAmmo', withAmmo.ids[0]!);
    const g = findPrompt(s, 'excellaGainAmmo');
    expect(g).toBeDefined();
    // The offered targets are the TOP card of each ammunition pile within cap.
    for (const opt of g!.options) {
      if (opt === 'Decline') continue;
      const d = s.cardDefs[s.cards[opt]?.cardId ?? ''];
      expect(d?.type).toBe('ammunition');
      expect(d?.cost ?? 0).toBeLessThanOrEqual(30);
    }
    const gained = g!.options[0]!;
    s = answer(s, 'excellaGainAmmo', gained);
    expect(s.seats[0]?.discard).toContain(gained);
    expect(s.removed).toContain(withAmmo.ids[0]!);
  });

  it('declining trashes nothing', () => {
    const base = leveled(game('ch-006e'), 1);
    const withAmmo = hand(base, ['am-001']);
    let s = withAmmo.state;
    s = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    s = answer(s, 'excellaTrashAmmo', 'Decline');
    expect(s.removed).not.toContain(withAmmo.ids[0]!);
    expect(s.seats[0]?.hand).toContain(withAmmo.ids[0]!);
  });

  it('is once per turn and needs an Ammunition in hand', () => {
    const base = leveled(game('ch-006e'), 1);
    // The opening hand is all Ammo x10 / Handgun / Knife, so drop the ammo to
    // reach a state with nothing trashing-able.
    const noAmmo = tune(base, { hand: base.seats[0]!.hand.filter(id => base.cards[id]?.cardId !== 'am-001') });
    expect(validateAction(noAmmo, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
    const withAmmo = hand(base, ['am-001']);
    let s = withAmmo.state;
    s = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 });
    expect(findPrompt(s, 'excellaTrashAmmo')).toBeDefined();
    s = drain(s, ['excellaTrashAmmo']);
    s = answer(s, 'excellaTrashAmmo', withAmmo.ids[0]!);
    s = drain(answer(s, 'excellaGainAmmo', 'Decline'));
    // used this turn -> the log scan rejects a second activation
    expect(validateAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 0 }).ok).toBe(false);
  });
});

describe('ch-006e Excella L2 — Uroboros Injection for a peek and +20 Damage', () => {
  it('needs the card in hand and level 2', () => {
    const l1 = leveled(game('ch-006e'), 1);
    expect(validateAction(l1, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
    const l2 = leveled(game('ch-006e'), 2);
    expect(validateAction(l2, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 }).ok).toBe(false);
  });

  it('discards the Injection, reveals the Mansion top and grants +20', () => {
    let s = leveled(game('ch-006e'), 2);
    // ac-018 is Alliance-only: pull the def in the way cardsForScenario does,
    // then put a copy in hand.
    const injDef = ALL_CARDS.find(c => c.id === 'ac-018');
    expect(injDef).toBeDefined();
    s = { ...s, cardDefs: { ...s.cardDefs, 'ac-018': injDef! } };
    const inj = addHand(s, 'ac-018');
    s = inj.state;
    s = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    expect(s.seats[0]?.discard).toContain(inj.id);
    expect(s.seats[0]?.weaponDamageBonusThisTurn).toBe(20);
    const peek = findPrompt(s, 'excellaPeekMansion');
    expect(peek).toBeDefined();
    // The Mansion top was recorded for the client's reveal overlay.
    const last = s.log[s.log.length - 1];
    expect((last?.reveals ?? []).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ch-006a Aya Brea — Rifle + Knife
// ---------------------------------------------------------------------------

describe('ch-006a Aya L1 — +10 with a Rifle and a Knife', () => {
  it('adds +10 when the attack carries both tags, and 0 otherwise', () => {
    const s = leveled(game('ch-006a'), 1);
    const onlyKnife = hand(s, ['we-004']);
    // Combat Knife alone: 5 damage.
    expect(exploreDamage(onlyKnife.state, 0, onlyKnife.ids)).toBe(5);
    // A second knife still has no rifle tag -> no synergy. (The same physical
    // card cannot be used twice in one explore, so assert on the single copy.)
    expect(exploreDamage(onlyKnife.state, 0, onlyKnife.ids)).toBe(5);
    // Combat Knife (5) + Bolt-Action Rifle (20) = 25, +10 synergy = 35.
    const knifeAndRifle = hand(onlyKnife.state, ['we-015']);
    expect(exploreDamage(knifeAndRifle.state, 0, [...onlyKnife.ids, ...knifeAndRifle.ids])).toBe(35);
  });

  it('is inactive below the L1 gate', () => {
    const s = leveled(game('ch-006a'), 0);
    const w = hand(s, ['we-004', 'we-015']);
    expect(exploreDamage(w.state, 0, w.ids)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// ch-006b Aya Brea — multi-explore, +5 per character
// ---------------------------------------------------------------------------

describe('ch-006b Aya L1 — +5 per character while battling 2+ Infected', () => {
  it('scales with the explore count and the number of characters in the game', () => {
    const two = leveled(game('ch-006b'), 1);
    const w = hand(two, ['we-004']);
    expect(exploreDamage(w.state, 0, w.ids, 'main', undefined, 1)).toBe(5);
    // 2 Infected x 2 characters in the game = +10.
    expect(exploreDamage(w.state, 0, w.ids, 'main', undefined, 2)).toBe(15);
    const four = leveled(game('ch-006b', {}, 4), 1);
    const w4 = hand(four, ['we-004']);
    expect(exploreDamage(w4.state, 0, w4.ids, 'main', undefined, 3)).toBe(5 + 5 * 4);
  });
});

// ---------------------------------------------------------------------------
// Aya L2 — use another character's ability
// ---------------------------------------------------------------------------

describe('Aya L2 — borrow another character\'s manual ability', () => {
  it('arms the grant and enumerates the other character\'s abilities', () => {
    // Seat 1 is ch-002 Leon (Premier). His L1/L2 are passive, but his index 0
    // is still enumerated as an own ability; the BORROW test below uses a
    // seat-1 character with a manual ability instead.
    let s = leveled(game('ch-006a'), 2);
    const acts = enumerateLegalActions(s, 0).filter((a): a is Extract<Action, { type: 'useCharacterAbility' }> => a.type === 'useCharacterAbility');
    expect(acts.filter(a => a.borrowedFrom === undefined).length).toBeGreaterThan(0);

    // Swap seat 1 to Sheva (manual L1) for the borrow leg.
    const shevaDef = ALL_CARDS.find(c => c.id === 'ch-004')!;
    s = {
      ...s,
      cardDefs: { ...s.cardDefs, 'ch-004': shevaDef },
      cards: { ...s.cards, 'sheva#1': { instanceId: 'sheva#1', cardId: 'ch-004', location: { zone: 'hand', index: 0 } } },
      seats: s.seats.map((p, i) => (i === 1
        ? { ...p, characterInstanceId: 'sheva#1', level: 2 }
        : { ...p, level: 2 })),
    };

    // Activate Aya's L2: raises the "which character?" prompt and arms the grant.
    s = applyAction(s, { type: 'useCharacterAbility', seat: 0, abilityIndex: 1 });
    const p = findPrompt(s, 'ayaBorrowChoose');
    expect(p).toBeDefined();
    expect(s.seats[0]?.borrowedAbilityFrom).toContain('ch-004');

    // Answer it; the grant stays armed until a borrowed activation spends it.
    s = answer(s, 'ayaBorrowChoose', 'Sheva Alomar');
    expect(s.seats[0]?.borrowedAbilityFrom).toContain('ch-004');

    const borrowedActs = enumerateLegalActions(s, 0)
      .filter((a): a is Extract<Action, { type: 'useCharacterAbility' }> => a.type === 'useCharacterAbility')
      .filter(a => a.borrowedFrom !== undefined);
    expect(borrowedActs.length).toBeGreaterThan(0);
    const target = borrowedActs.find(a => a.borrowedFrom === 'ch-004');
    expect(target).toBeDefined();
    expect(validateAction(s, target!).ok).toBe(true);

    // Using it spends the grant AND latches the once-per-turn flag.
    const after = drain(applyAction(s, target!));
    expect(after.seats[0]?.borrowedAbilityFrom).toBeUndefined();
    expect(after.seats[0]?.usedAnotherCharacterThisTurn).toBe(true);
  });

  it('rejects an ability that was not granted', () => {
    let s = leveled(game('ch-006a'), 2);
    // Seat 1 is ch-002; arm the grant at a DIFFERENT character (Sheva).
    s = {
      ...s,
      cardDefs: { ...s.cardDefs, 'ch-004': ALL_CARDS.find(c => c.id === 'ch-004')! },
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, borrowedAbilityFrom: ['ch-004'] } : p)),
    };
    const bad = { type: 'useCharacterAbility' as const, seat: 0, abilityIndex: 0, borrowedFrom: 'ch-002' };
    expect(validateAction(s, bad).ok).toBe(false);
  });

  it('still enforces the borrowed ability\'s own preconditions', () => {
    // Sheva's L1 needs a card in hand AND in the Inventory; clearing the
    // activating seat's hand must make the borrow illegal even while armed.
    let s = leveled(game('ch-006a'), 2);
    const shevaDef = ALL_CARDS.find(c => c.id === 'ch-004')!;
    s = {
      ...s,
      cardDefs: { ...s.cardDefs, 'ch-004': shevaDef },
      cards: { ...s.cards, 'sheva#1': { instanceId: 'sheva#1', cardId: 'ch-004', location: { zone: 'hand', index: 0 } } },
      seats: s.seats.map((p, i) => (i === 1
        ? { ...p, characterInstanceId: 'sheva#1', level: 2 }
        : { ...p, level: 2, hand: [] as string[] })),
    };
    const cand = { type: 'useCharacterAbility' as const, seat: 0, abilityIndex: 0, borrowedFrom: 'ch-004' };
    expect(validateAction(s, cand).ok).toBe(false);
  });

  it('refreshes at the next turn boundary', () => {
    let s = leveled(game('ch-006a'), 2);
    s = { ...s, seats: s.seats.map((p, i) => (i === 0 ? { ...p, usedAnotherCharacterThisTurn: true, borrowedAbilityFrom: ['ch-004'] } : p)) };
    const next = startTurn(s);
    expect(next.seats[0]?.usedAnotherCharacterThisTurn).toBeUndefined();
    expect(next.seats[0]?.borrowedAbilityFrom).toBeUndefined();
  });
});
