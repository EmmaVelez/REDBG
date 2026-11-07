import { describe, it, expect } from 'vitest';
import type { CardInstance, GameState } from '../types';
import { setup, startTurn } from './game';
import { applyAction } from './actions';
import { validateAction } from './validate';
import { FIRST_TIMER_PILES, STANDARD_MANSION_DECK, PREMIER_CARDS, pilesForScenario, MERCENARIES_MANSION, cardsForScenario } from '../data/cards';
import { MERCENARIES_CARDS } from '../data/mercenaries';
import { isSkillActive, activeSkillEffects, skillDamageReduction, consumeNegateDamage, consumeInfectedEffectReaction } from './skill';

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

describe('Mercenaries reactive / turn-start Skills', () => {
  /** Inject an active Skill instance straight into a seat's Skill Area. */
  function injectSkill(s: GameState, seat: number, cardId: string, xp: number): GameState {
    const instanceId = `${cardId}#test-${seat}`;
    const inst: CardInstance = { instanceId, cardId, xp, location: { zone: 'skillArea', index: 0 } };
    return {
      ...s,
      cards: { ...s.cards, [instanceId]: inst },
      seats: s.seats.map((p, i) => (i === seat ? { ...p, skills: [...(p.skills ?? []), instanceId] } : p)),
    };
  }

  function postDraft(overrides: Record<string, unknown> = {}): GameState {
    return runDraft(setup(makeSetup(overrides), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK));
  }

  it('SK-008 Luck LV.2 arms a reaction, then negates the next Damage and removes the XP', () => {
    let s = postDraft();
    s = injectSkill(s, 0, 'sk-008', 3);
    const skillId = 'sk-008#test-0';
    expect(validateAction(s, { type: 'useSkill', seat: 0, skillInstanceId: skillId }).ok).toBe(true);
    s = applyAction(s, { type: 'useSkill', seat: 0, skillInstanceId: skillId });
    expect(s.seats[0]?.pendingSkillEffects).toEqual([{ kind: 'negateNextDamage', skillInstanceId: skillId }]);
    // The XP is only paid when the reaction fires, not when it is declared.
    expect(s.cards[skillId]?.xp).toBe(3);
    const consumed = consumeNegateDamage(s, 0);
    expect(consumed.negated).toBe(true);
    expect(consumed.state.cards[skillId]?.xp).toBe(0);
    expect(consumed.state.seats[0]?.pendingSkillEffects ?? []).toHaveLength(0);
    // Nothing left to consume on a second hit.
    expect(consumeNegateDamage(consumed.state, 0).negated).toBe(false);
  });

  it('SK-009 Luck LV.3 copies the other active Skills so they stack', () => {
    let s = postDraft();
    s = injectSkill(s, 0, 'sk-011', 3); // Toughness LV.2: -10 damage
    expect(skillDamageReduction(activeSkillEffects(s, 0))).toBe(10);
    s = injectSkill(s, 0, 'sk-009', 5); // Luck LV.3: copy the others
    const effects = activeSkillEffects(s, 0);
    expect(effects.filter(e => e.kind === 'damageReduction')).toHaveLength(2);
    expect(skillDamageReduction(effects)).toBe(20);
  });

  it('SK-010 Toughness LV.1 negates an Infected effect and removes the XP', () => {
    let s = postDraft();
    s = injectSkill(s, 0, 'sk-010', 2);
    const skillId = 'sk-010#test-0';
    s = applyAction(s, { type: 'useSkill', seat: 0, skillInstanceId: skillId });
    expect(s.seats[0]?.pendingSkillEffects).toEqual([{ kind: 'negateNextInfectedEffect', skillInstanceId: skillId }]);
    const consumed = consumeInfectedEffectReaction(s, 0);
    expect(consumed.negated).toBe(true);
    expect(consumed.redirectSeat).toBeUndefined();
    expect(consumed.state.cards[skillId]?.xp).toBe(0);
  });

  it('SK-012 Toughness LV.3 redirects an Infected effect to another Player', () => {
    let s = postDraft();
    s = injectSkill(s, 0, 'sk-012', 4);
    const skillId = 'sk-012#test-0';
    s = applyAction(s, { type: 'useSkill', seat: 0, skillInstanceId: skillId });
    const prompt = s.prompts.find(p => p.payload?.kind === 'skillRedirectInfectedEffect');
    expect(prompt).toBeDefined();
    const option = prompt?.options.indexOf('1');
    expect(option).toBeGreaterThanOrEqual(0);
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: option as number });
    expect(s.seats[0]?.pendingSkillEffects).toEqual([{ kind: 'redirectNextInfectedEffect', skillInstanceId: skillId, targetSeat: 1 }]);
    const consumed = consumeInfectedEffectReaction(s, 0);
    expect(consumed.negated).toBe(false);
    expect(consumed.redirectSeat).toBe(1);
    expect(consumed.state.cards[skillId]?.xp).toBe(0);
  });

  it('SK-029 Handgun Technique LV.2 offers +1 Explore at turn start', () => {
    let s = postDraft();
    s = injectSkill(s, 0, 'sk-029', 5);
    const mk = (n: number): CardInstance => ({ instanceId: `we-049#p${n}`, cardId: 'we-049', location: { zone: 'hand', index: n } });
    s = {
      ...s,
      cards: { ...s.cards, 'we-049#p1': mk(1), 'we-049#p2': mk(2) },
      seats: s.seats.map((p, i) => (i === 0 ? { ...p, hand: [...p.hand, 'we-049#p1', 'we-049#p2'] } : p)),
    };
    s = startTurn(s);
    const prompt = s.prompts.find(p => p.payload?.kind === 'skillRevealPistolsForExplore');
    expect(prompt).toBeDefined();
    s = applyAction(s, { type: 'chooseOption', seat: 0, promptId: prompt!.id, option: 0 });
    expect(s.seats[0]?.exploresLeft).toBe(2);
    expect(s.prompts.find(p => p.payload?.kind === 'skillRevealPistolsForExplore')).toBeUndefined();
  });

  it('SK-029 is not offered without enough Pistol Weapons in hand', () => {
    let s = postDraft();
    s = injectSkill(s, 0, 'sk-029', 5);
    s = startTurn(s);
    expect(s.prompts.find(p => p.payload?.kind === 'skillRevealPistolsForExplore')).toBeUndefined();
  });
});

describe('Mercenaries Skill System + Partner Modification', () => {
  it('keeps 2 Skills instead of 3 and assigns the second to the partner', () => {
    const draft = setup(makeSetup({ partnerMode: true }), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(draft.skillDraft?.keepTarget).toBe(2);
    let s = draft;
    for (let round = 0; round < 5; round++) {
      for (let seat = 0; seat < 2; seat++) {
        const prompt = s.prompts.find(p => p.seat === seat && p.payload?.kind === 'skillDraftPick');
        expect(prompt, `pick r${round} s${seat}`).toBeDefined();
        s = applyAction(s, { type: 'chooseOption', seat, promptId: prompt!.id, option: 0 });
      }
    }
    for (let seat = 0; seat < 2; seat++) {
      for (let k = 0; k < 2; k++) {
        const prompt = s.prompts.find(p => p.seat === seat && p.payload?.kind === 'skillDraftKeep');
        expect(prompt, `keep s${seat} k${k}`).toBeDefined();
        s = applyAction(s, { type: 'chooseOption', seat, promptId: prompt!.id, option: 0 });
      }
    }
    expect(s.phase).toBe('main');
    expect(s.seats[0]?.skills).toHaveLength(2);
    expect(s.seats[1]?.skills).toHaveLength(2);
    // The second kept Skill belongs to the partner Character.
    expect(s.seats[0]?.partnerSkillId).toBe(s.seats[0]?.skills?.[1]);
    expect(s.seats[1]?.partnerSkillId).toBe(s.seats[1]?.skills?.[1]);
  });
});

describe('Skill System card availability (any scenario)', () => {
  it('cardsForScenario adds the 30 Skill cards when skillSystem is on', () => {
    const cards = cardsForScenario('firstTimer', { skillSystem: true });
    expect(cards.filter(c => c.type === 'skill')).toHaveLength(30);
    // The base scenario's own cards are untouched.
    expect(cards).toHaveLength(PREMIER_CARDS.length + 30);
    // No skill card is duplicated when the scenario already carries them.
    const expansion = cardsForScenario('mercenaries', { skillSystem: true });
    const skillIds = expansion.filter(c => c.type === 'skill').map(c => c.id);
    expect(new Set(skillIds).size).toBe(skillIds.length);
  });

  it('a base scenario + skillSystem starts the draft (the real server flow)', () => {
    const s = setup(makeSetup(), cardsForScenario('firstTimer', { skillSystem: true }), FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(s.phase).toBe('skillDraft');
    expect(s.skillDraft?.hands[0]).toHaveLength(5);
    expect(s.skillDraft?.hands[1]).toHaveLength(5);
    expect(s.prompts[0]?.payload?.kind).toBe('skillDraftPick');
  });

  it('does not deadlock when the Skill cards are absent from the card list', () => {
    // Safety net: the caller forgot to include the Skill cards. The game must
    // still start (main phase, no prompts) rather than lock in skillDraft.
    const s = setup(makeSetup(), PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(s.phase).toBe('main');
    expect(s.prompts).toHaveLength(0);
    expect(validateAction(s, { type: 'endTurn', seat: 0 }).ok).toBe(true);
  });
});
