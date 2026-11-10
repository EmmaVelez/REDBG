import { describe, it, expect } from 'vitest';
import { setup } from './game';
import { applyAction } from './actions';
import { CUSTOM_CARDS } from '../data/custom';
import { PREMIER_CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK } from '../data/cards';
import { MERCENARIES_CARDS } from '../data/mercenaries';

const CARDS = [...PREMIER_CARDS, ...MERCENARIES_CARDS, ...CUSTOM_CARDS];

function makeSetup(overrides: Record<string, unknown> = {}) {
  return {
    seed: 11,
    players: [
      { name: 'A', controller: 'human' as const, characterCardId: 'cr-001' },
      { name: 'B', controller: 'human' as const, characterCardId: 'ch-002' },
    ],
    ...overrides,
  };
}

/** Drive the opening Skill draft to completion (5 pick rounds + 3 keeps each). */
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

/**
 * Turn 1 has to come out of startTurn exactly like every later turn: that is
 * where the turn-start pools and the beginning-of-turn ability prompts are
 * applied. setup() used to hand back the raw pools, so the opening turn
 * silently ignored CR-001's +1 Buy (and every other turn-start effect).
 */
describe('the opening turn goes through startTurn', () => {
  it('applies CR-001 L1 +1 Buy on turn 1', () => {
    const s = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(s.turnNumber).toBe(1);
    expect(s.seats[0]?.level).toBe(1);
    expect(s.seats[0]?.buysLeft).toBe(2);
  });

  it('leaves a character without a buy ability at 1 Buy', () => {
    const s = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(s.seats[1]?.buysLeft).toBe(1);
  });

  it('does not disturb the opening hand', () => {
    const s = setup(makeSetup(), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(s.seats[0]?.hand).toHaveLength(5);
  });

  it('applies the turn-start pools after the Skill draft too', () => {
    const drafted = setup(makeSetup({ skillSystem: true }), CARDS, FIRST_TIMER_PILES, STANDARD_MANSION_DECK);
    expect(drafted.phase).toBe('skillDraft');
    const s = runDraft(drafted);
    expect(s.phase).toBe('main');
    expect(s.turnNumber).toBe(1);
    expect(s.seats[0]?.skills).toHaveLength(3);
    expect(s.seats[0]?.buysLeft).toBe(2);
  });
});
