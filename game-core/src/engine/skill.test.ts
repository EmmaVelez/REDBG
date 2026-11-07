import { describe, it, expect } from 'vitest';
import type { GameState } from '../types';
import { setup } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { FIRST_TIMER_PILES, STANDARD_MANSION_DECK, PREMIER_CARDS, pilesForScenario, MERCENARIES_MANSION } from '../data/cards';
import { MERCENARIES_CARDS } from '../data/mercenaries';
import { isSkillActive } from './skill';

const CARDS = [...PREMIER_CARDS, ...MERCENARIES_CARDS];

function makeSetup(overrides: Record<string, unknown> = {}) {
  return {
    seed: 7,
    players: [
      { name: 'A', controller: 'human' as const },
      { name: 'B', controller: 'human' as const },
    ],
    skillSystem: true,
    ...overrides,
  };
}

/** Drive the opening draft to completion and return the resulting state. */
function runDraft(state: ReturnType<typeof setup>): ReturnType<typeof setup> {
  let s = state;
  for (let round = 0; round < 5; round++) {
    for (let seat = 0; seat < 2; seat++) {
      const prompt = s.prompts.find(p => p.seat === seat && p.payload?.kind === 'skillDraftPick');
      expect(prompt, `pick prompt r${round} seat${seat}`).toBeDefined();
      s = applyAction(s, { type: 'chooseOption', seat, promptId: prompt!.id, option: 0 });
    }
  }
  for (let seat = 0; seat < 2; seat++) {
    for (let k = 0; k < 3; k++) {
      const prompt = s.prompts.find(p => p.seat === seat && p.payload?.kind === 'skillDraftKeep');
      expect(prompt, `keep prompt seat${seat} k${k}`).toBeDefined();
      s = applyAction(s, { type: 'chooseOption', seat, promptId: prompt!.id, option: 0 });
    }
  }
  return s;
}

describe('Mercenaries card data', () => {
  const MERC = MERCENARIES_CARDS;

  it('contains the full printed inventory (86 cards)', () => {
    const count = (t: string) => MERC.filter(c => c.type === t).length;
    expect(count('character')).toBe(8);
    expect(count('weapon')).toBe(8);
    expect(count('action')).toBe(10);
    expect(count('infected')).toBe(26);
    expect(count('ammunition')).toBe(3);
    expect(count('item')).toBe(1);
    expect(count('skill')).toBe(30);
    expect(MERC).toHaveLength(86);
  });

  it('has unique ids following the printed numbering scheme', () => {
    const ids = MERC.map(c => c.id);
    expect(new Set(ids).size).toBe(MERC.length);
    for (const c of MERC) {
      expect(c.id).toMatch(/^(ch|we|ac|ma|am|it|sk)-\d{3}$/);
      expect(c.set).toBe('mercenaries');
      expect(c.copies).toBeGreaterThanOrEqual(1);
      expect(c.text).not.toBe('');
    }
  });

  it('gives every Mercenaries character a single level with a gate', () => {
    for (const c of MERC.filter(c => c.type === 'character')) {
      expect(c.maxHp, `${c.id} maxHp`).toBeGreaterThan(0);
      expect(c.level1At, `${c.id} level1At`).toBeGreaterThan(0);
      expect(c.level2At, `${c.id} has no L2`).toBeUndefined();
      expect(c.levels).toHaveLength(1);
      expect(c.levels?.[0]?.level).toBe(1);
      expect(c.abilities?.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses the Mercenaries scenario piles and a full mansion', () => {
    expect(pilesForScenario('mercenaries')).toHaveLength(18);
    const mansion = MERCENARIES_MANSION.map(m => m.cardId);
    expect(new Set(mansion).size).toBe(mansion.length);
    expect(mansion).toContain('ma-010'); // Uroboros = the Story Mode win condition
  });
});

describe('Mercenaries Skill System', () => {
  it('exposes exactly 30 unique skill cards', () => {
    expect(MERCENARIES_CARDS.filter(c => c.type === 'skill')).toHaveLength(30);
    const ids = MERCENARIES_CARDS.filter(c => c.type === 'skill').map(c => c.id);
    expect(new Set(ids).size).toBe(30);
    for (const c of MERCENARIES_CARDS) {
      if (c.type !== 'skill') continue;
      expect(c.skillXp, `${c.id} has skillXp`).toBeGreaterThan(0);
      expect(c.skillEffects?.length, `${c.id} has an effect`).toBeGreaterThan(0);
    }
  });

  it('starts in the skillDraft phase with 5 cards per seat and one pick prompt', () => {
    const s = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(s.phase).toBe('skillDraft');
    expect(s.skillSystem).toBe(true);
    expect(s.skillDraft).toBeDefined();
    expect(s.skillDraft!.hands[0]).toHaveLength(5);
    expect(s.skillDraft!.hands[1]).toHaveLength(5);
    expect(s.prompts).toHaveLength(1);
    expect(s.prompts[0]?.payload?.kind).toBe('skillDraftPick');
    expect(s.prompts[0]?.seat).toBe(0);
  });

  it('runs the pass-left draft and deals 3 kept Skills per seat', () => {
    const draft = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    const s = runDraft(draft);
    expect(s.phase).toBe('main');
    expect(s.skillDraft).toBeUndefined();
    expect(s.seats[0]?.skills).toHaveLength(3);
    expect(s.seats[1]?.skills).toHaveLength(3);
    // 30 drafted pool: 10 dealt, 6 kept, 24 removed (20 undealt + 4 dropped).
    expect(s.removed).toHaveLength(24);
    // No card is in two skill areas.
    const all = [...(s.seats[0]?.skills ?? []), ...(s.seats[1]?.skills ?? [])];
    expect(new Set(all).size).toBe(6);
  });

  it('moves XP onto a Skill and activates it at the requirement', () => {
    const draft = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    let s = runDraft(draft);
    const skillId = s.seats[0]?.skills?.[0] as string;
    const req = s.cardDefs[s.cards[skillId]?.cardId ?? '']?.skillXp ?? 0;
    s = {
      ...s,
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, xp: req } : p)),
    };
    expect(validateAction(s, { type: 'moveXp', seat: 0, skillInstanceId: skillId, amount: req }).ok).toBe(true);
    s = applyAction(s, { type: 'moveXp', seat: 0, skillInstanceId: skillId, amount: req });
    expect(s.seats[0]?.xp).toBe(0);
    expect(s.cards[skillId]?.xp).toBe(req);
    expect(isSkillActive(s, skillId)).toBe(true);
  });

  it('rejects moving more XP than the Character has', () => {
    const draft = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    const s = runDraft(draft);
    const skillId = s.seats[0]?.skills?.[0] as string;
    const result = validateAction(s, { type: 'moveXp', seat: 0, skillInstanceId: skillId, amount: 1 });
    expect(result.ok).toBe(false);
  });

  it('grants +1 XP when the Character Explores', () => {
    const draft = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    let s = runDraft(draft);
    // Arm the turn: ammo + a handgun in hand.
    const seat = s.seats[0] as NonNullable<GameState['seats'][number]>;
    const ammo = seat.hand.find(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.type === 'ammunition');
    const weapon = seat.hand.find(id => s.cardDefs[s.cards[id]?.cardId ?? '']?.type === 'weapon');
    expect(ammo).toBeDefined();
    expect(weapon).toBeDefined();
    s = applyAction(s, { type: 'playAmmo', seat: 0, instanceId: ammo as string });
    s = applyAction(s, { type: 'explore', seat: 0, weapons: [weapon as string], exploreCount: 1 });
    expect(s.seats[0]?.xp).toBe(1);
  });
});
